/** @jsxRuntime automatic */
// Both transparent SVGs use the supplied artwork. The light version changes
// only the white lettering, so theme changes never resize or box in the logo.
export function WibrawlBrand({ mode = 'gaming', loading, fetchPriority }) {
  return <span className="wb-logo-badge"><img
    src={`/wibrawl/${mode === 'sports' ? 'logo-light' : 'logo'}.svg?v=master-a`}
    alt="Wibrawl" width="1025" height="815" loading={loading}
    fetchPriority={fetchPriority} decoding="async"
  /></span>;
}
