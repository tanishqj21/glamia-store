const COLOUR_HEX_BY_NAME = [
  ["winter sangria", "#8f2e4f"],
  ["sage green", "#88a889"],
  ["teal green", "#318b7a"],
  ["rose pink", "#c56b86"],
  ["midnight blue", "#283f6b"],
  ["chocolate brown", "#6c452d"],
  ["ivory", "#eee5d2"],
  ["cream", "#f0e6cf"],
  ["white", "#f4f1ea"],
  ["black", "#252525"],
  ["charcoal", "#454545"],
  ["navy", "#253b63"],
  ["sage", "#88a889"],
  ["tan", "#b8895b"],
  ["brass", "#b58a3a"],
];

const FALLBACK_COLOUR_HEX = "#b9d5c2";

export function isColourHex(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

export function colourHexForName(value) {
  const name = String(value || "").trim().toLowerCase();
  const exact = COLOUR_HEX_BY_NAME.find(([label]) => name === label);
  if (exact) return exact[1];
  if (/black|charcoal|graphite|midnight|navy/.test(name)) return "#283f6b";
  if (/white|ivory|cream|pearl|beige|sand/.test(name)) return "#eee5d2";
  if (/red|maroon|burgundy|wine|rose|pink/.test(name)) return "#c56b86";
  if (/orange|rust|terracotta|gold|yellow|mustard/.test(name)) return "#b8895b";
  if (/green|olive|mint|teal|emerald/.test(name)) return "#4f947f";
  if (/blue|cyan|aqua|lilac|purple|violet|plum/.test(name)) return "#567fbd";
  if (/brown|tan|camel|khaki/.test(name)) return "#8a603e";
  return FALLBACK_COLOUR_HEX;
}

export function colourHex(value, fallbackName = "") {
  return isColourHex(value) ? String(value).trim().toLowerCase() : colourHexForName(fallbackName);
}

export function colourSwatchStyle(name, explicitHex = "") {
  return { backgroundColor: colourHex(explicitHex, name) };
}
