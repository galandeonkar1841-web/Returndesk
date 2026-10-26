import "dotenv/config";
import { Pool } from "pg";

const STATUSES = ["open", "in_review", "approved", "rejected", "completed"] as const;
const REASONS = ["damaged", "wrong_item", "size_issue", "not_as_described", "changed_mind"] as const;
const RESOLUTIONS = ["refund", "replacement", "store_credit"] as const;

const CUSTOMERS = [
  ["Aarav Sharma", "aarav.sharma@example.com", "+91 98200 11001"],
  ["Priya Nair", "priya.nair@example.com", "+91 98200 11002"],
  ["Rohan Patil", "rohan.patil@example.com", "+91 98200 11003"],
  ["Sneha Kulkarni", "sneha.kulkarni@example.com", null],
  ["Vikram Singh", "vikram.singh@example.com", "+91 98200 11005"],
  ["Ananya Desai", "ananya.desai@example.com", "+91 98200 11006"],
  ["Karan Mehta", "karan.mehta@example.com", null],
  ["Isha Joshi", "isha.joshi@example.com", "+91 98200 11008"],
  ["Mihir Shah", "mihir.shah@example.com", "+91 98200 11009"],
  ["Neha Gupta", "neha.gupta@example.com", "+91 98200 11010"],
] as const;

const ITEMS = [
  ["SKU-1001", "Running Shoes"],
  ["SKU-1002", "Cotton T-Shirt"],
  ["SKU-1003", "Bluetooth Speaker"],
  ["SKU-1004", "Denim Jacket"],
  ["SKU-1005", "Steel Water Bottle"],
  ["SKU-1006", "Laptop Backpack"],
  ["SKU-1007", "Desk Lamp"],
] as const;

const NOTE_BODIES = [
  "Customer contacted by email, waiting for photos of the item.",
  "Photos received. Damage looks genuine.",
  "Checked with warehouse: correct size was shipped, customer ordered the wrong one.",
  "Customer prefers store credit over a cash refund.",
  "Courier pickup arranged for tomorrow.",
  "Item received back at warehouse and inspected.",
  "Escalated to the team lead for a second opinion.",
];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // TRUNCATE does not fire the row-level append-only trigger on notes.
    await client.query("TRUNCATE notes, requests RESTART IDENTITY");
    await client.query("ALTER SEQUENCE request_ref_seq RESTART WITH 1");

    const total = 36;
    let noteCount = 0;

    for (let i = 0; i < total; i++) {
      const status = STATUSES[i % STATUSES.length];
      const reason = REASONS[(i + Math.floor(i / 5)) % REASONS.length];
      const [name, email, phone] = CUSTOMERS[i % CUSTOMERS.length];
      const [itemRef, itemName] = ITEMS[(i * 3) % ITEMS.length];
      const orderRef = `ORD-${5000 + i}`;

      const decided = status === "approved" || status === "completed";
      const resolution = decided ? RESOLUTIONS[i % RESOLUTIONS.length] : null;
      const refundAmount = resolution === "refund" ? (499 + ((i * 137) % 3500)).toFixed(2) : null;
      const hoursAgo = (total - i) * 7;

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO requests
           (customer_name, customer_email, customer_phone, order_ref, item_ref, item_name,
            quantity, reason, status, resolution, refund_amount, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                 now() - ($12 || ' hours')::interval, now() - ($12 || ' hours')::interval)
         RETURNING id`,
        [name, email, phone, orderRef, itemRef, itemName, (i % 3) + 1, reason, status,
         resolution, refundAmount, String(hoursAgo)],
      );

      // Notes on roughly two thirds of the requests, more for later statuses.
      const notesToWrite = status === "open" ? (i % 2) : 1 + (i % 3);
      for (let n = 0; n < notesToWrite; n++) {
        await client.query(
          `INSERT INTO notes (request_id, body, author, created_at)
           VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
          [rows[0].id, NOTE_BODIES[(i + n) % NOTE_BODIES.length], n % 2 === 0 ? "Asha (support)" : "Dev (support)",
           String(Math.max(hoursAgo - (n + 1) * 2, 1))],
        );
        noteCount++;
      }
    }

    // Rule 3 demo: an earlier request on this order/item was Rejected, so a fresh one is allowed.
    await client.query(
      `INSERT INTO requests (customer_name, customer_email, order_ref, item_ref, item_name, quantity, reason, status, created_at, updated_at)
       VALUES ('Sneha Kulkarni','sneha.kulkarni@example.com','ORD-5003','SKU-1003','Bluetooth Speaker',1,'changed_mind','open', now() - interval '3 hours', now() - interval '3 hours')`,
    );

    // A soft-deleted request: stays in the database, hidden from the desk.
    await client.query(
      `INSERT INTO requests (customer_name, customer_email, order_ref, item_ref, item_name, quantity, reason, status, deleted_at)
       VALUES ('Removed Example','removed@example.com','ORD-9999','SKU-1001','Running Shoes',1,'changed_mind','open', now())`,
    );

    await client.query("COMMIT");
    console.log(`seeded ${total + 1} visible requests (+1 removed) and ${noteCount} notes`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
