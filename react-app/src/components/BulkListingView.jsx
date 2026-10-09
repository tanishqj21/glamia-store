import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { apiFetch } from "../lib/api";
import { taxRuleFor } from "./TaxCodePicker";

const BULK_HEADERS = [
  "Name", "Category", "Subcategory", "Brand", "Price", "MRP", "Colour", "Material", "HSN Code", "Tax Code Type", "GST Rate (%)", "Price Includes GST", "Returnable", "Description", "What's in the Box", "Sizes", "Stock by Size", "Images", "Size Chart URL",
];

const TEMPLATE_ROW = [
  "Pearl Button Knit Polo", "Women", "Tops", "Aster Lane", 2299, 3499, "Pearl", "Ribbed Cotton Knit", "6109", "HSN", 12, "Yes",
  "Yes", "A soft ribbed knit polo with pearl buttons and a polished fit.", "1 polo shirt, spare button, care card", "XS|S|M|L", "XS:6|S:10|M:12|L:8",
  "https://example.com/front.jpg|https://example.com/back.jpg|https://example.com/detail.jpg|https://example.com/look.jpg", "",
];

function text(value) { return String(value ?? "").trim(); }
function splitList(value) { return text(value).split(/[|,]/).map((entry) => entry.trim()).filter(Boolean); }
function cell(row, key) { return text(row[key] ?? row[key.toLowerCase()] ?? ""); }

function parseSizeStock(value, sizes) {
  const parsed = {};
  text(value).split(/[|,]/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const separator = part.indexOf(":");
    if (separator < 1) return;
    const size = part.slice(0, separator).trim();
    const quantity = Number(part.slice(separator + 1).trim());
    if (size && Number.isSafeInteger(quantity) && quantity >= 0) parsed[size] = quantity;
  });
  return Object.fromEntries(sizes.map((size) => [size, parsed[size] ?? 0]));
}

function normalizeRow(raw, index, categories, subcategories) {
  const name = cell(raw, "Name");
  const category = cell(raw, "Category");
  const subcategory = cell(raw, "Subcategory");
  const brand = cell(raw, "Brand");
  const price = Number(cell(raw, "Price"));
  const mrp = Number(cell(raw, "MRP"));
  const color = cell(raw, "Colour") || cell(raw, "Color");
  const material = cell(raw, "Material");
  const hsnSacCode = (cell(raw, "HSN Code") || cell(raw, "HSN / SAC Code") || cell(raw, "Tax Code")).toUpperCase();
  const hsnSacType = (cell(raw, "Tax Code Type") || cell(raw, "HSN / SAC Type") || "HSN").toUpperCase();
  const gstRateInput = cell(raw, "GST Rate (%)") || cell(raw, "GST Rate");
  const taxInclusiveInput = cell(raw, "Price Includes GST") || cell(raw, "GST Inclusive");
  const returnableInput = cell(raw, "Returnable") || cell(raw, "Returns");
  const description = cell(raw, "Description");
  const whatInBox = cell(raw, "What's in the Box") || cell(raw, "What’s in the Box") || cell(raw, "What is in the box");
  const sizes = splitList(cell(raw, "Sizes"));
  const images = splitList(cell(raw, "Images"));
  const sizeStock = parseSizeStock(cell(raw, "Stock by Size"), sizes);
  const categoryMatch = categories.find((entry) => entry.toLowerCase() === category.toLowerCase());
  const subcategoryMatch = subcategories.find((entry) => entry.category?.toLowerCase() === category.toLowerCase() && entry.name?.toLowerCase() === subcategory.toLowerCase());
  const errors = [];

  if (!name) errors.push("name is required");
  if (!categoryMatch) errors.push(`category “${category || "—"}” is not available`);
  if (subcategory && !subcategoryMatch) errors.push(`subcategory “${subcategory}” does not match that category`);
  if (!brand) errors.push("brand is required");
  if (!Number.isSafeInteger(price) || price < 1) errors.push("price must be a positive whole number");
  if (!Number.isSafeInteger(mrp) || mrp < 1 || price > mrp) errors.push("MRP must be a whole number at least as high as price");
  if (!["HSN", "SAC"].includes(hsnSacType)) errors.push("tax code type must be HSN or SAC");
  const autoTaxRule = taxRuleFor(hsnSacCode, price, mrp);
  const gstRate = gstRateInput === "" ? (autoTaxRule?.rate ?? null) : Number(gstRateInput);
  if (gstRateInput !== "" && (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100)) errors.push("GST rate must be between 0 and 100");
  if (!color) errors.push("colour is required");
  if (!material) errors.push("material is required");
  if (description.length < 3) errors.push("description is required");
  if (whatInBox.length < 2) errors.push("what's in the box is required");
  if (!sizes.length) errors.push("add at least one size");
  if (sizes.some((size) => size.length > 10)) errors.push("size labels must be 10 characters or fewer");
  const stock = Object.values(sizeStock).reduce((sum, value) => sum + value, 0);
  if (stock < 1) errors.push("stock by size must include at least one unit");
  if (images.length < 4 || images.length > 15) errors.push("add 4–15 image URLs separated by |");
  if (images.some((url) => !(/^(https?:\/\/|\/api\/assets\/)/i.test(url)))) errors.push("images must be HTTPS URLs or uploaded asset URLs");

  return {
    rowNumber: index + 2,
    errors,
    result: "",
    product: {
      name, category: categoryMatch || category, subcategory: subcategoryMatch?.name || "", brand,
      price, mrp, color, material, hsn_sac_code: hsnSacCode, hsn_sac_type: hsnSacType,
      gst_rate: gstRate, gst_tax_inclusive: !["no", "false", "0", "n"].includes(taxInclusiveInput.toLowerCase()),
      returnable: !["no", "false", "0", "n"].includes(returnableInput.toLowerCase()),
      description, what_in_box: whatInBox, sizes, size_stock: sizeStock, stock, images,
      thumbnail_urls: images.slice(0, 1), image_keys: [], variants: [], size_chart_url: cell(raw, "Size Chart URL"), reorder_point: 15,
    },
  };
}

function downloadTemplate() {
  const workbook = XLSX.utils.book_new();
  const products = XLSX.utils.aoa_to_sheet([BULK_HEADERS, TEMPLATE_ROW]);
  products["!cols"] = BULK_HEADERS.map((header, index) => ({ wch: index === 8 ? 16 : index === 13 || index === 14 ? 52 : index === 17 ? 70 : Math.max(16, header.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, products, "Products");
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Glamia bulk listing template"],
    ["Use one row per product. New products are created on hold for admin review."],
    ["Field", "How to fill"],
    ["Sizes", "Separate sizes with |, for example XS|S|M|L"],
    ["Stock by Size", "Use size:quantity pairs separated with |, for example XS:6|S:10|M:12|L:8"],
    ["HSN Code", "Add the confirmed HSN code for goods. HSN / SAC Code is also accepted for compatibility."],
    ["Tax Code Type", "Use HSN for goods or SAC for services. Defaults to HSN when blank."],
    ["GST Rate (%)", "Optional confirmed rate. If blank, known apparel/footwear defaults are applied when available."],
    ["Price Includes GST", "Use Yes or No. Defaults to Yes when blank."],
    ["Returnable", "Use Yes or No. Defaults to Yes when blank; No marks the listing as final sale."],
    ["What's in the Box", "Required. List every item included in the package, separated by commas or semicolons."],
    ["Images", "Add 4 to 15 HTTPS image URLs separated with |. The first image becomes the thumbnail."],
    ["Category and Subcategory", "Use names that already exist in the store category catalogue."],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.writeFile(workbook, "glamia-bulk-products-template.xlsx");
}

export function BulkListingView({ categories, subcategories }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("");
  const [busy, setBusy] = useState(false);
  const validRows = useMemo(() => rows.filter((row) => !row.errors.length), [rows]);

  function clearRows() {
    setRows([]);
    setFileName("");
    setMessage("");
    setTone("");
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
      if (!rawRows.length) throw new Error("The spreadsheet has no product rows.");
      if (rawRows.length > 100) throw new Error("Import up to 100 products at a time.");
      const parsed = rawRows.map((row, index) => normalizeRow(row, index, categories, subcategories));
      const valid = parsed.filter((row) => !row.errors.length).length;
      setRows(parsed);
      setTone(valid ? "success" : "error");
      setMessage(`${valid} of ${parsed.length} rows are ready. New listings will be created on hold.`);
    } catch (error) {
      setTone("error");
      setMessage(error.message || "Could not read that spreadsheet.");
    }
  }

  async function importListings() {
    if (!validRows.length || busy) return;
    setBusy(true);
    setTone("");
    setMessage("Importing listings one at a time…");
    let imported = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        const response = await apiFetch("/api/products", { method: "POST", body: JSON.stringify(row.product) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Listing could not be created");
        imported += 1;
        setRows((current) => current.map((entry) => entry.rowNumber === row.rowNumber ? { ...entry, result: "Imported" } : entry));
      } catch (error) {
        failed += 1;
        setRows((current) => current.map((entry) => entry.rowNumber === row.rowNumber ? { ...entry, result: error.message || "Import failed" } : entry));
      }
    }
    setTone(failed ? "error" : "success");
    setMessage(`${imported} listing${imported === 1 ? "" : "s"} imported on hold${failed ? ` · ${failed} failed` : "."}`);
    setBusy(false);
  }

  return <section className="admin-panel admin-wide-panel bulk-listing-panel">
    <div className="admin-panel-heading"><div><p className="eyebrow">Catalog operations</p><h2>Bulk listing</h2></div><span>Up to 100 rows per import</span></div>
    <p className="muted bulk-listing-intro">Download the template, add one product per row, preview the validation results, then import ready rows as listings on hold.</p>
    <div className="bulk-actions">
      <button className="primary-action" type="button" onClick={downloadTemplate}>Download XLSX template <span aria-hidden="true">↓</span></button>
      <label className="secondary-action bulk-file-button">Choose XLSX or CSV<input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readFile} /></label>
      {rows.length > 0 && <button className="secondary-action" type="button" onClick={clearRows}>Clear preview</button>}
    </div>
    {fileName && <p className="form-hint bulk-file-name">Selected: {fileName}</p>}
    
    {rows.length > 0 && <>
      <div className="bulk-summary"><strong>{validRows.length} ready</strong><span>{rows.length - validRows.length} need attention</span><span>Rows with errors will not be imported.</span></div>
      <div className="bulk-preview-table"><table><thead><tr><th>Row</th><th>Product</th><th>Category</th><th>HSN</th><th>GST</th><th>Price</th><th>Stock</th><th>Box</th><th>Images</th><th>Result</th></tr></thead><tbody>{rows.map((row) => <tr className={row.errors.length ? "has-errors" : "is-valid"} key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.product.name || "—"}</td><td>{row.product.category || "—"}</td><td>{row.product.hsn_sac_code || "—"}</td><td>{Number.isFinite(row.product.gst_rate) ? `${row.product.gst_rate}%` : "—"}</td><td>{Number.isFinite(row.product.price) ? `₹${row.product.price.toLocaleString("en-IN")}` : "—"}</td><td>{row.product.stock || 0}</td><td title={row.product.what_in_box || undefined}>{row.product.what_in_box || "—"}</td><td>{row.product.images.length}</td><td>{row.errors.length ? <span className="error-text">{row.errors.join("; ")}</span> : row.result ? <span className="status-pill live">{row.result}</span> : <span className="status-pill">Ready</span>}</td></tr>)}</tbody></table></div>
      {message && <p className={`inline-note ${tone}`} role="status" aria-live="polite">{message}</p>}
      <button className="primary-action" type="button" disabled={!validRows.length || busy} onClick={importListings}>{busy ? "Importing…" : `Import ${validRows.length} ready listing${validRows.length === 1 ? "" : "s"}`} </button>
    </>}
    {!rows.length && <div className="bulk-empty"><strong>Start with a clean import</strong><span>The template includes HSN/GST fields, a Products sheet, and a short Instructions sheet so tax classification, size-level stock, and image requirements stay clear.</span></div>}
  </section>;
}
