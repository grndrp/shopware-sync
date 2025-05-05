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

async function fetchVehicles() {
  try {
    const url = `/tenants/${process.env.SHOPWARE_TENANT_ID}/vehicles`;
    const response = await shopware.get(url);

    // DEBUG: Uncomment this to inspect structure
    // console.dir(response.data, { depth: null });

    const vehicles = response.data?.data;

    if (!Array.isArray(vehicles)) {
      console.warn("⚠️ Unexpected vehicle response format:");
      console.dir(response.data, { depth: null });
      return [];
    }

    console.log(`🔍 Retrieved ${vehicles.length} vehicle(s) from Shop-Ware.`);
    return vehicles;
  } catch (err) {
    console.error("❌ Error fetching vehicles:", err.response?.data || err);
    return [];
  }
}

async function processVehicles(vehicles) {
  for (const v of vehicles) {
    const customerShopwareId = v.customer_ids?.[0];
    if (!customerShopwareId) {
      console.warn("⚠️ No Shop-Ware customer ID on vehicle. Skipping.");
      continue;
    }

    // Look up customer by Shop-Ware ID
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, email")
      .eq("shopware_customer_id", customerShopwareId)
      .single();

    if (customerError || !customer) {
      console.warn(`⚠️ No matching customer in Supabase for Shop-Ware ID ${customerShopwareId}`);
      continue;
    }

    const { id: customer_id, email: ownerEmail } = customer;
    const makeModel = [v.make, v.model].filter(Boolean).join(" ");

    const { error: upsertError } = await supabase
      .from("vehicles")
      .upsert({
        customer_id,
        vehicle_make_model: makeModel,
        license_plate: v.plate?.toUpperCase() || null,
        vin: v.vin || null,
        year: v.year || null,
        synced_from_shopware: true,
      }, {
        onConflict: 'vin'  // or 'license_plate' if that's your unique key
      });

    if (upsertError) {
      console.error(`❌ Error inserting vehicle for ${ownerEmail}:`, upsertError);
    } else {
      console.log(`✅ Synced vehicle for ${ownerEmail}: ${makeModel}`);
    }
  }

  console.log("🚘 Vehicle sync complete.");
}

// Run it all
async function main() {
  const vehicles = await fetchVehicles();
  await processVehicles(vehicles);
}

main();
