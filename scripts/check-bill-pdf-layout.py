"""Verify synthetic bill text and geometry after rendering with the real generator."""
from pathlib import Path
import pdfplumber

paths = [Path("output/pdf/glamia-bill-preview.pdf"),
         Path("tmp/pdfs/glamia-bill-multipage.pdf"),
         Path("tmp/pdfs/glamia-bill-long-fields.pdf")]
for path in paths:
    with pdfplumber.open(path) as document:
        content = "\n".join(page.extract_text() or "" for page in document.pages)
        for required in ["GM-20261001-000001", "ORDER BILL", "Total", "IST", "support@glamiastore.com"]:
            assert required in content, (path, required)
        for index, page in enumerate(document.pages):
            outside = [char for char in page.chars
                       if char["x0"] < 40 or char["x1"] > 556
                       or char["top"] < 25 or char["bottom"] > 812]
            assert not outside, (path, index, outside[:3])
            assert f"Page {index + 1} of {len(document.pages)}" in (page.extract_text() or "")
            # Footer must be separated from all body text by a clear margin.
            body = [char for char in page.chars if char["top"] < 780]
            assert not any(char["bottom"] > 766 for char in body), (path, index, "body touches footer")
        if path.name == "glamia-bill-preview.pdf":
            assert len(document.pages) == 1
            for required in ["₹1,898.00", "₹1,800.00", "₹1,700.00", "₹100.00", "₹98.00", "02:30 pm IST"]:
                assert required in content, (path, required)
        if path.name == "glamia-bill-multipage.pdf":
            assert len(document.pages) > 1
            for index in range(1, 31):
                assert f"Night suit {index}" in content
        print(f"PASS {path}: {len(document.pages)} pages, expected amounts/text, page numbers and safe margins")
