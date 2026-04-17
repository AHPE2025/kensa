import base64
import io
from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pdf2image import convert_from_bytes
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
FONT_NAME = "HeiseiKakuGo-W5"


class ProjectInfo(BaseModel):
  name: str
  address: str
  inspection_date: str


class ContractorInfo(BaseModel):
  name: str


class Pin(BaseModel):
  x: float = Field(ge=0, le=1)
  y: float = Field(ge=0, le=1)


class IssuePayload(BaseModel):
  no: int
  pin: Pin
  callout: Pin
  issue_type: str
  issue_text: str
  status: str = "open"
  floor_label: Optional[str] = None


class PagePayload(BaseModel):
  page_index: int
  pdf_page_image_base64: Optional[str] = None
  issues: list[IssuePayload] = Field(default_factory=list)


class DrawingPayload(BaseModel):
  floor_label: str
  pdf_file_base64: Optional[str] = None
  pages: list[PagePayload] = Field(default_factory=list)


class GeneratePayload(BaseModel):
  project: ProjectInfo
  contractor: ContractorInfo
  drawings: list[DrawingPayload]
  generated_at: str


class RenderPagesPayload(BaseModel):
  pdf_file_base64: str
  dpi: int = Field(default=160, ge=96, le=300)


def build_styles():
  sample = getSampleStyleSheet()
  return {
    "title": ParagraphStyle(
      "title",
      parent=sample["Title"],
      fontName=FONT_NAME,
      fontSize=18,
      leading=24,
    ),
    "normal": ParagraphStyle(
      "normal",
      parent=sample["BodyText"],
      fontName=FONT_NAME,
      fontSize=10,
      leading=14,
    ),
    "small": ParagraphStyle(
      "small",
      parent=sample["BodyText"],
      fontName=FONT_NAME,
      fontSize=9,
      leading=12,
    ),
  }


class DrawingPageFlowable(Flowable):
  def __init__(self, floor_label: str, page_index: int, image_bytes: bytes, issues: list[IssuePayload]):
    super().__init__()
    self.floor_label = floor_label
    self.page_index = page_index
    self.image_bytes = image_bytes
    self.issues = issues
    self.width, self.height = A4

  def wrap(self, availWidth, availHeight):
    return self.width, self.height

  def draw(self):
    canvas = self.canv
    page_w, page_h = A4
    margin = 30
    title_h = 24

    canvas.setFont(FONT_NAME, 11)
    canvas.drawString(margin, page_h - margin, f"階: {self.floor_label} / ページ: {self.page_index + 1}")

    image_reader = ImageReader(io.BytesIO(self.image_bytes))
    img_w, img_h = image_reader.getSize()
    draw_w = page_w - margin * 2
    draw_h = page_h - margin * 2 - title_h
    ratio = min(draw_w / img_w, draw_h / img_h)
    rendered_w = img_w * ratio
    rendered_h = img_h * ratio
    origin_x = margin + (draw_w - rendered_w) / 2
    origin_y = margin

    canvas.drawImage(image_reader, origin_x, origin_y, width=rendered_w, height=rendered_h)

    for issue in self.issues:
      pin_x = origin_x + issue.pin.x * rendered_w
      pin_y = origin_y + (1 - issue.pin.y) * rendered_h
      callout_x = origin_x + issue.callout.x * rendered_w
      callout_y = origin_y + (1 - issue.callout.y) * rendered_h

      canvas.setStrokeColor(colors.red)
      canvas.setFillColor(colors.red)
      canvas.line(pin_x, pin_y, callout_x, callout_y)
      canvas.circle(pin_x, pin_y, 6, stroke=1, fill=1)

      canvas.setFillColor(colors.white)
      canvas.setFont(FONT_NAME, 8)
      canvas.drawCentredString(pin_x, pin_y - 2, str(issue.no))

      box_w, box_h = 180, 38
      canvas.setFillColor(colors.white)
      canvas.setStrokeColor(colors.darkblue)
      canvas.roundRect(callout_x, callout_y, box_w, box_h, 4, stroke=1, fill=1)

      canvas.setFillColor(colors.black)
      canvas.setFont(FONT_NAME, 8)
      text = f"{issue.issue_type} {issue.issue_text[:24]}"
      canvas.drawString(callout_x + 6, callout_y + 24, text)
      canvas.drawString(callout_x + 6, callout_y + 11, f"No.{issue.no} status:{issue.status}")


def to_png_bytes_from_page_image_base64(image64: str) -> bytes:
  return base64.b64decode(image64)


def to_png_bytes_from_pdf_page(pdf64: str, page_index: int) -> bytes:
  pdf_bytes = base64.b64decode(pdf64)
  images = convert_from_bytes(pdf_bytes, dpi=180, first_page=page_index + 1, last_page=page_index + 1)
  if not images:
    raise ValueError("PDF page conversion failed")
  buffer = io.BytesIO()
  images[0].save(buffer, format="PNG")
  return buffer.getvalue()


def render_pdf_to_png_base64_list(pdf_bytes: bytes, dpi: int) -> list[str]:
  images = convert_from_bytes(pdf_bytes, dpi=dpi)
  encoded: list[str] = []
  for image in images:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
  return encoded


def build_pdf(payload: GeneratePayload) -> bytes:
  styles = build_styles()
  output = io.BytesIO()
  doc = SimpleDocTemplate(
    output,
    pagesize=A4,
    leftMargin=24,
    rightMargin=24,
    topMargin=24,
    bottomMargin=24,
  )

  story = []
  story.append(Paragraph("検査指摘書", styles["title"]))
  story.append(Spacer(1, 10))
  story.append(Paragraph(f"物件名: {payload.project.name}", styles["normal"]))
  story.append(Paragraph(f"住所: {payload.project.address}", styles["normal"]))
  story.append(Paragraph(f"検査日: {payload.project.inspection_date}", styles["normal"]))
  story.append(Paragraph(f"業者名: {payload.contractor.name}", styles["normal"]))
  story.append(Paragraph(f"出力日: {payload.generated_at}", styles["normal"]))
  story.append(Spacer(1, 10))
  story.append(Paragraph("凡例: open=未対応 / done=完了", styles["small"]))
  story.append(Spacer(1, 8))

  table_header = ["番号", "階", "区分", "内容", "ページ", "状態"]
  rows = [table_header]
  for drawing in payload.drawings:
    for page in drawing.pages:
      for issue in page.issues:
        rows.append([
          str(issue.no),
          issue.floor_label or drawing.floor_label,
          issue.issue_type,
          issue.issue_text,
          str(page.page_index + 1),
          issue.status,
        ])
  if len(rows) == 1:
    rows.append(["-", "-", "-", "対象指摘なし", "-", "-"])

  issue_table = Table(rows, colWidths=[40, 50, 52, 240, 40, 50], repeatRows=1)
  issue_table.setStyle(
    TableStyle([
      ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
      ("FONTSIZE", (0, 0), (-1, -1), 9),
      ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E7F0FF")),
      ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
      ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ])
  )
  story.append(issue_table)

  for drawing in payload.drawings:
    for page in drawing.pages:
      if not page.issues:
        continue
      story.append(PageBreak())
      if page.pdf_page_image_base64:
        image_bytes = to_png_bytes_from_page_image_base64(page.pdf_page_image_base64)
      elif drawing.pdf_file_base64:
        image_bytes = to_png_bytes_from_pdf_page(drawing.pdf_file_base64, page.page_index)
      else:
        raise ValueError("No page image source provided")
      story.append(DrawingPageFlowable(drawing.floor_label, page.page_index, image_bytes, page.issues))

  doc.build(story)
  return output.getvalue()


app = FastAPI(title="drawing-pdf-service")


@app.get("/health")
def health():
  return {"ok": True, "date": date.today().isoformat()}


@app.post("/generate")
def generate(payload: GeneratePayload):
  try:
    pdf_bytes = build_pdf(payload)
  except Exception as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  return Response(content=pdf_bytes, media_type="application/pdf")


@app.post("/render-pages")
def render_pages(payload: RenderPagesPayload):
  try:
    pdf_bytes = base64.b64decode(payload.pdf_file_base64)
    images_base64 = render_pdf_to_png_base64_list(pdf_bytes, payload.dpi)
  except Exception as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  return {"page_count": len(images_base64), "images_base64": images_base64}
