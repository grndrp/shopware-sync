require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Shop-Ware API setup
const shopware = axios.create({
  baseURL: process.env.SHOPWARE_BASE_URL,
  headers: {
    "X-Api-Partner-Id": process.env.SHOPWARE_PARTNER_ID,
    "X-Api-Secret": process.env.SHOPWARE_SECRET,
    Accept: "application/json",
  },
});

// Fetch vehicles with pagination
async function fetchVehicles() {
  const vehicles = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `/tenants/${process.env.SHOPWARE_TENANT_ID}/vehicles?page=${page}`;
      const response = await shopware.get(url);
      const results = response.data.results || [];

      if (results.length === 0) {
        hasMore = false;
      } else {
        console.log(`📦 Page ${page}: Retrieved ${results.length} vehicles`);
        vehicles.push(...results);
        page++;
      }
    } catch (err) {
      console.error(`❌ Error fetching page ${page}:`, err.response?.data || err);
      break;
    }
  }

  console.log(`🚗 Retrieved ${vehicles.length} vehicle(s) from Shop-Ware.`);
  return vehicles;
}

// Process and sync vehicles to Supabase
async function processVehicles(vehicles) {
    const skippedDueToMissingCustomer = [];
  
    for (const vehicle of vehicles) {
      const customerIds = vehicle.customer_ids;
  
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        console.warn(`⚠️ Skipping vehicle ${vehicle.id} with no customer_ids`);
        continue;
      }
  
      const shopwareCustomerId = customerIds[0];
  
      // Check if customer exists in Supabase
      const { data: matchingCustomer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("shopware_customer_id", shopwareCustomerId)
        .single();
  
      if (customerError || !matchingCustomer) {
        console.warn(`⚠️ Skipping vehicle ${vehicle.id}: customer ${shopwareCustomerId} not found`);
        skippedDueToMissingCustomer.push({
          vehicle_id: vehicle.id,
          shopware_customer_id: shopwareCustomerId,
        });
        continue;
      }
  
      const { id, make, model, created_at, updated_at } = vehicle;
  
      const { error } = await supabase.from("vehicles").upsert(
        {
          shopware_vehicle_id: id,
          shopware_customer_id: shopwareCustomerId,
          vehicle_make: make,
          vehicle_model: model,
          created_at,
          updated_at,
          synced_from_shopware: true,
        },
        {
          onConflict: "shopware_vehicle_id",
        }
      );
  
      if (error) {
        console.error(`❌ Error syncing vehicle ${id}:`, error);
      } else {
        console.log(`✅ Synced vehicle ${id}`);
      }
    }
  
    console.log("🚙 Vehicle sync complete.");
  
    if (skippedDueToMissingCustomer.length > 0) {
      console.log("📋 Skipped vehicles due to missing customers:");
      console.table(skippedDueToMissingCustomer);
    }
  }
  

async function main() {
  const vehicles = await fetchVehicles();
  await processVehicles(vehicles);
}

main();
