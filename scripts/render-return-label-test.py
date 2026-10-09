"""Create a synthetic PDF solely for the merchant-authorized label-download test."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

folder = Path(__file__).resolve().parents[1] / "output" / "pdf"
folder.mkdir(parents=True, exist_ok=True)
target = folder / "glamia-return-label-test.pdf"
document = canvas.Canvas(str(target), pagesize=A4)
document.setTitle("Glamia - TEST ONLY - Not a shipping label")
width, height = A4
document.setFillColor(colors.HexColor("#322143"))
document.rect(0, height - 130, width, 130, fill=1, stroke=0)
document.setFillColor(colors.white)
document.setFont("Helvetica-Bold", 24)
document.drawString(42, height - 60, "GLAMIA / DOCUMENT TEST")
document.setFont("Helvetica-Bold", 14)
document.drawString(42, height - 92, "TEST ONLY - DO NOT SHIP")
document.setFillColor(colors.HexColor("#322143"))
document.setFont("Helvetica-Bold", 16)
document.drawString(42, height - 182, "Private return-label download verification")
document.setFillColor(colors.HexColor("#45404a"))
document.setFont("Helvetica", 11)
lines = [
    "This synthetic document checks the authorized upload/download flow.",
    "It is not a courier-issued label, pickup booking, or refund receipt.",
    "It contains no address, tracking code, barcode, or payment information.",
    "No parcel may be dispatched using this document.",
    "The real courier label must be supplied separately when required.",
    "Verification marker: GLAMIA-LABEL-TEST-2026-10-04",
]
for index, line in enumerate(lines):
    document.drawString(42, height - 220 - index * 28, line)
document.setStrokeColor(colors.HexColor("#d6cedd"))
document.line(42, 78, width - 42, 78)
document.setFont("Helvetica", 10)
document.drawString(42, 55, "TEST DOCUMENT / No shipping or financial validity")
document.showPage()
document.save()
print(target)
