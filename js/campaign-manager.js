(function(root){
  'use strict';
  const CampaignManager = {};
  const CAMPAIGN_FIELDS = ['campaign_slug','campaign_code','name','organization_name','public_description','status','starts_at','ends_at','payment_mode','delivery_mode','branding_config','public_config','internal_notes'];
  const PRODUCT_FIELDS = ['campaign_id','campaign_sku','product_recipe_id','display_name','public_description','display_order','enabled','standard_customer_price','personalized_customer_price','olipoly_standard_share','olipoly_personalized_share','personalization_enabled','personalization_instructions','personalization_limits','image_url','reference_url'];
  const STATUSES = ['draft','scheduled','active','closed','archived'];
  const PAYMENT_MODES = ['external_org_collects','olipoly_collects'];
  const DELIVERY_MODES = ['organization_pickup','event_pickup','customer_pickup','shipping','mixed'];
  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

  const asNumber = value => value === '' || value == null ? null : Number(value);
  const parseJson = (value, fallback) => {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const pick = (input, fields) => fields.reduce((out, field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
    return out;
  }, {});
  function cleanCampaignPayload(input){
    const row = pick(input || {}, CAMPAIGN_FIELDS);
    row.campaign_slug = String(row.campaign_slug || '').trim().toLowerCase();
    row.campaign_code = String(row.campaign_code || '').trim().toUpperCase();
    row.name = String(row.name || '').trim();
    row.organization_name = String(row.organization_name || '').trim();
    row.status = STATUSES.includes(row.status) ? row.status : 'draft';
    row.payment_mode = PAYMENT_MODES.includes(row.payment_mode) ? row.payment_mode : 'external_org_collects';
    row.delivery_mode = DELIVERY_MODES.includes(row.delivery_mode) ? row.delivery_mode : 'organization_pickup';
    row.starts_at = row.starts_at || null;
    row.ends_at = row.ends_at || null;
    row.branding_config = parseJson(row.branding_config, {});
    row.public_config = parseJson(row.public_config, {});
    if (!row.campaign_slug || !row.campaign_code || !row.name || !row.organization_name) throw new Error('Campaign slug, code, name, and organization are required.');
    return row;
  }
  function cleanProductPayload(input){
    const row = pick(input || {}, PRODUCT_FIELDS);
    row.campaign_sku = String(row.campaign_sku || '').trim().toUpperCase();
    row.display_name = String(row.display_name || '').trim();
    row.display_order = Math.max(0, Number(row.display_order || 0));
    row.enabled = row.enabled !== false;
    row.standard_customer_price = asNumber(row.standard_customer_price) ?? 0;
    row.personalized_customer_price = asNumber(row.personalized_customer_price);
    row.olipoly_standard_share = asNumber(row.olipoly_standard_share) ?? 0;
    row.olipoly_personalized_share = asNumber(row.olipoly_personalized_share);
    row.personalization_enabled = row.personalization_enabled === true;
    row.personalization_limits = parseJson(row.personalization_limits, {});
    if (!row.campaign_sku || !row.display_name) throw new Error('Product SKU and display name are required.');
    return row;
  }
  async function request(path, init){
    const token = root.OliPolyAuth?.getToken?.() || localStorage.getItem('sb_token');
    if (!token) throw new Error('Sign in is required.');
    const res = await fetch(`${SUPABASE_URL}${path}`, { ...(init || {}), headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...(init?.headers || {}) } });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.message || data?.hint || text || `Supabase request failed (${res.status})`);
    return data;
  }
  CampaignManager.cleanCampaignPayload = cleanCampaignPayload;
  CampaignManager.cleanProductPayload = cleanProductPayload;
  CampaignManager.tables = Object.freeze({ campaigns:'campaigns', products:'campaign_products', publicRpc:'get_public_campaign' });
  CampaignManager.enums = Object.freeze({ STATUSES, PAYMENT_MODES, DELIVERY_MODES });
  CampaignManager.api = Object.freeze({
    listCampaigns: () => request('/rest/v1/campaigns?select=*&order=updated_at.desc'),
    listProducts: campaignId => request(`/rest/v1/campaign_products?select=*&campaign_id=eq.${encodeURIComponent(campaignId)}&order=display_order.asc,campaign_sku.asc`),
    createCampaign: async (input) => {
      const user = await root.OliPolyAuth.getUser();
      if (!user?.id) throw new Error('Sign in is required.');
      return request('/rest/v1/campaigns', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify({ ...cleanCampaignPayload(input), user_id:user.id }) }).then(rows => rows[0]);
    },
    updateCampaign: (id, input) => request(`/rest/v1/campaigns?id=eq.${encodeURIComponent(id)}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(cleanCampaignPayload(input)) }).then(rows => rows[0]),
    upsertProduct: async (input) => {
      const user = await root.OliPolyAuth.getUser();
      if (!user?.id) throw new Error('Sign in is required.');
      const row = { ...cleanProductPayload(input), user_id:user.id };
      if (input.id) return request(`/rest/v1/campaign_products?id=eq.${encodeURIComponent(input.id)}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(row) }).then(rows => rows[0]);
      return request('/rest/v1/campaign_products', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify(row) }).then(rows => rows[0]);
    }
  });
  root.OliPolyCampaignManager = Object.freeze(CampaignManager);
  if (typeof module !== 'undefined') module.exports = CampaignManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
