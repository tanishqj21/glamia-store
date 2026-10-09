// Website navigation follows the same current employee capabilities as the app.
export const ADMIN_AREA_PERMISSIONS = {
  "/admin": "dashboard", "/admin/storefront": "storefront", "/admin/about": "storefront", "/admin/events": "events", "/admin/hero": "hero",
  "/admin/tax": "tax", "/admin/coupons": "coupons", "/admin/credits": "credits", "/admin/labels": "labels", "/admin/employees": "employees",
  "/admin/manage-store": "manage_store", "/admin/add-product": "add_product", "/admin/bulk-listing": "bulk_listing",
  "/admin/orders": "orders", "/admin/completed-orders": "orders", "/admin/products": "products", "/admin/inventory": "inventory", "/admin/notifications": "notifications",
  "/admin/customers": "customers", "/admin/reviews": "reviews", "/admin/questions": "questions", "/admin/deals": "deals",
  "/admin/categories": "categories", "/admin/returns": "returns", "/admin/support": "support", "/admin/system": "system"
};

export function canUseAdminArea(user, path) {
  if (user?.role !== "admin") return false;
  if (!user.employee_id || user.is_owner) return true;
  return user.employee_permissions?.[ADMIN_AREA_PERMISSIONS[path]] === true;
}

// Staff land on a permitted workspace even when Dashboard access is switched off.
export function adminLandingPath(user) {
  return Object.keys(ADMIN_AREA_PERMISSIONS).find(path => canUseAdminArea(user, path)) || "/";
}
