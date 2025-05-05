require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Shop-Ware client setup
const shopware = axios.create({
  baseURL: process.env.SHOPWARE_BASE_URL,
  headers: {
    "X-Api-Partner-Id": process.env.SHOPWARE_PARTNER_ID,
    "X-Api-Secret": process.env.SHOPWARE_SECRET,
    Accept: "application/json",
  },
});

// Fetch customers with pagination
async function fetchAllCustomers() {
  let allCustomers = [];
  let page = 1;
  const limit = 100; // Increase if the API allows

  while (true) {
    try {
      const url = `/tenants/${process.env.SHOPWARE_TENANT_ID}/customers?page=${page}&limit=${limit}`;
      const response = await shopware.get(url);
      const customers = response.data.results || [];

      if (customers.length === 0) break;

      allCustomers.push(...customers);
      console.log(`🔄 Page ${page}: Retrieved ${customers.length} customers`);
      page++;

      if (!response.data.limited || page > response.data.total_pages) break;

    } catch (err) {
      console.error("❌ Error fetching customers:", err.response?.data || err);
      break;
    }
  }

  console.log(`✅ Total customers retrieved: ${allCustomers.length}`);
  return allCustomers;
}

// Upsert customers into Supabase
async function processCustomers(customers) {
  for (const c of customers) {
    const {
      id, first_name, last_name, email, address, city, state, zip,
      marketing_ok, created_at, updated_at
    } = c;

    if (!email) {
      console.warn(`⚠️ Skipping customer with no email: ${id}`);
      continue;
    }

    const { error } = await supabase.from("customers").upsert({
      shopware_customer_id: id,
      first_name,
      last_name,
      email: email.toLowerCase(),
      address,
      city,
      state,
      zip,
      marketing_ok: marketing_ok || false,
      created_at,
      updated_at,
      synced_from_shopware: true,
    }, {
      onConflict: 'shopware_customer_id'
    });

    if (error) {
      console.error(`❌ Error syncing customer ${email}:`, error);
    } else {
      console.log(`✅ Synced customer: ${email}`);
    }
  }

  console.log("👥 Customer sync complete.");
}

async function main() {
  const customers = await fetchAllCustomers();
  await processCustomers(customers);
}

main();
