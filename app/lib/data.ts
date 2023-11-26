import { sql } from "@vercel/postgres";
import {
  CustomerField,
  CustomersTable,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";
import { unstable_noStore as noStore } from "next/cache";

export async function fetchRevenue() {
  // Add noStore() here prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).
  noStore();
  try {
    // Artificially delay a reponse for demo purposes.
    // Don't do this in real life :)

    // console.log('Fetching revenue data...');
    // await new Promise((resolve) => setTimeout(resolve, 3000));

    const data = await sql<Revenue>`SELECT * FROM nextjsdashboardrevenue`;

    // console.log('Data fetch complete after 3 seconds.');

    return data.rows;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
}

export async function fetchLatestInvoices() {
  noStore();
  try {
    const data = await sql<LatestInvoiceRaw>`
      SELECT nextjsdashboardinvoices.amount, nextjsdashboardcustomers.name, nextjsdashboardcustomers.image_url, nextjsdashboardcustomers.email, nextjsdashboardinvoices.id
      FROM nextjsdashboardinvoices
      JOIN nextjsdashboardcustomers ON nextjsdashboardinvoices.customer_id = nextjsdashboardcustomers.id
      ORDER BY nextjsdashboardinvoices.date DESC
      LIMIT 5`;

    const latestInvoices = data.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }
}

export async function fetchCardData() {
  noStore();
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM nextjsdashboardinvoices`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM nextjsdashboardcustomers`;
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM nextjsdashboardinvoices`;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0].rows[0].count ?? "0");
    const numberOfCustomers = Number(data[1].rows[0].count ?? "0");
    const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? "0");
    const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? "0");

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  noStore();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await sql<InvoicesTable>`
      SELECT
        nextjsdashboardinvoices.id,
        nextjsdashboardinvoices.amount,
        nextjsdashboardinvoices.date,
        nextjsdashboardinvoices.status,
        nextjsdashboardcustomers.name,
        nextjsdashboardcustomers.email,
        nextjsdashboardcustomers.image_url
      FROM nextjsdashboardinvoices
      JOIN nextjsdashboardcustomers ON nextjsdashboardinvoices.customer_id = nextjsdashboardcustomers.id
      WHERE
        nextjsdashboardcustomers.name ILIKE ${`%${query}%`} OR
        nextjsdashboardcustomers.email ILIKE ${`%${query}%`} OR
        nextjsdashboardinvoices.amount::text ILIKE ${`%${query}%`} OR
        nextjsdashboardinvoices.date::text ILIKE ${`%${query}%`} OR
        nextjsdashboardinvoices.status ILIKE ${`%${query}%`}
      ORDER BY nextjsdashboardinvoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices.rows;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoices.");
  }
}

export async function fetchInvoicesPages(query: string) {
  noStore();
  try {
    const count = await sql`SELECT COUNT(*)
    FROM nextjsdashboardinvoices
    JOIN nextjsdashboardcustomers ON nextjsdashboardinvoices.customer_id = nextjsdashboardcustomers.id
    WHERE
      nextjsdashboardcustomers.name ILIKE ${`%${query}%`} OR
      nextjsdashboardcustomers.email ILIKE ${`%${query}%`} OR
      nextjsdashboardinvoices.amount::text ILIKE ${`%${query}%`} OR
      nextjsdashboardinvoices.date::text ILIKE ${`%${query}%`} OR
      nextjsdashboardinvoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

export async function fetchInvoiceById(id: string) {
  noStore();
  try {
    const data = await sql<InvoiceForm>`
      SELECT
        nextjsdashboardinvoices.id,
        nextjsdashboardinvoices.customer_id,
        nextjsdashboardinvoices.amount,
        nextjsdashboardinvoices.status
      FROM nextjsdashboardinvoices
      WHERE nextjsdashboardinvoices.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoice.");
  }
}

export async function fetchCustomers() {
  try {
    const data = await sql<CustomerField>`
      SELECT
        id,
        name
      FROM nextjsdashboardcustomers
      ORDER BY name ASC
    `;

    const customers = data.rows;
    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch all customers.");
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTable>`
		SELECT
		  nextjsdashboardcustomers.id,
		  nextjsdashboardcustomers.name,
		  nextjsdashboardcustomers.email,
		  nextjsdashboardcustomers.image_url,
		  COUNT(nextjsdashboardinvoices.id) AS total_invoices,
		  SUM(CASE WHEN nextjsdashboardinvoices.status = 'pending' THEN nextjsdashboardinvoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN nextjsdashboardinvoices.status = 'paid' THEN nextjsdashboardinvoices.amount ELSE 0 END) AS total_paid
		FROM nextjsdashboardcustomers
		LEFT JOIN nextjsdashboardinvoices ON nextjsdashboardcustomers.id = nextjsdashboardinvoices.customer_id
		WHERE
		  nextjsdashboardcustomers.name ILIKE ${`%${query}%`} OR
        nextjsdashboardcustomers.email ILIKE ${`%${query}%`}
		GROUP BY nextjsdashboardcustomers.id, nextjsdashboardcustomers.name, nextjsdashboardcustomers.email, nextjsdashboardcustomers.image_url
		ORDER BY nextjsdashboardcustomers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}

export async function getUser(email: string) {
  try {
    const user =
      await sql`SELECT * FROM nextjsdashboarduser WHERE email=${email}`;
    return user.rows[0] as User;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}
