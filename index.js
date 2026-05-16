const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();

const VIVIRSTAR_SECRET = defineSecret("VIVIRSTAR_SHOPIFY_WEBHOOK_SECRET");
const ZOMA_SECRET = defineSecret("ZOMA_SHOPIFY_WEBHOOK_SECRET");

const allowedStores = ["vivirstar", "zoma"];

function getStore(req) {
  const store = String(req.query.store || "").toLowerCase().trim();

  if (!allowedStores.includes(store)) {
    return null;
  }

  return store;
}

function getSecretForStore(store) {
  if (store === "vivirstar") return VIVIRSTAR_SECRET.value();
  if (store === "zoma") return ZOMA_SECRET.value();
  return null;
}

function verifyShopifyWebhook(req, secret) {
  const hmacHeader = req.get("x-shopify-hmac-sha256");

  if (!hmacHeader || !secret || !req.rawBody) {
    return false;
  }

  const generatedHash = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  const generatedBuffer = Buffer.from(generatedHash, "utf8");
  const receivedBuffer = Buffer.from(hmacHeader, "utf8");

  if (generatedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(generatedBuffer, receivedBuffer);
}

function safeId(value) {
  return String(value || Date.now())
    .replace(/\//g, "_")
    .replace(/\s+/g, "_");
}

function getCustomerName(customer) {
  if (!customer) return "";

  const firstName = customer.first_name || "";
  const lastName = customer.last_name || "";

  return `${firstName} ${lastName}`.trim();
}

function normalizeOrder(payload, store, eventType, req) {
  return {
    store,
    eventType,
    shopifyId: payload.id || null,
    name: payload.name || null,
    orderNumber: payload.order_number || null,
    customerName: getCustomerName(payload.customer),
    email: payload.email || payload.contact_email || null,
    phone:
      payload.phone ||
      payload.customer?.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      null,
    totalPrice: payload.total_price || null,
    currency: payload.currency || null,
    financialStatus: payload.financial_status || null,
    fulfillmentStatus: payload.fulfillment_status || null,
    cancelledAt: payload.cancelled_at || null,
    createdAtShopify: payload.created_at || null,
    updatedAtShopify: payload.updated_at || null,
    shopDomain: req.get("x-shopify-shop-domain") || null,
    shopifyTopic: req.get("x-shopify-topic") || null,
    webhookId: req.get("x-shopify-webhook-id") || null,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload,
  };
}

function normalizeCustomer(payload, store, eventType, req) {
  return {
    store,
    eventType,
    shopifyId: payload.id || null,
    firstName: payload.first_name || null,
    lastName: payload.last_name || null,
    customerName: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
    email: payload.email || null,
    phone: payload.phone || null,
    ordersCount: payload.orders_count || 0,
    totalSpent: payload.total_spent || null,
    createdAtShopify: payload.created_at || null,
    updatedAtShopify: payload.updated_at || null,
    shopDomain: req.get("x-shopify-shop-domain") || null,
    shopifyTopic: req.get("x-shopify-topic") || null,
    webhookId: req.get("x-shopify-webhook-id") || null,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload,
  };
}

function normalizeCheckout(payload, store, eventType, req) {
  return {
    store,
    eventType,
    shopifyId: payload.id || null,
    token: payload.token || null,
    cartToken: payload.cart_token || null,
    name: payload.name || null,
    email: payload.email || null,
    phone:
      payload.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      null,
    totalPrice: payload.total_price || null,
    currency: payload.currency || null,
    completedAt: payload.completed_at || null,
    abandonedCheckoutUrl: payload.abandoned_checkout_url || null,
    createdAtShopify: payload.created_at || null,
    updatedAtShopify: payload.updated_at || null,
    shopDomain: req.get("x-shopify-shop-domain") || null,
    shopifyTopic: req.get("x-shopify-topic") || null,
    webhookId: req.get("x-shopify-webhook-id") || null,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload,
  };
}

function normalizeDraftOrder(payload, store, eventType, req) {
  return {
    store,
    eventType,
    shopifyId: payload.id || null,
    name: payload.name || null,
    email: payload.email || null,
    phone:
      payload.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      null,
    totalPrice: payload.total_price || null,
    currency: payload.currency || null,
    status: payload.status || null,
    invoiceUrl: payload.invoice_url || null,
    completedAt: payload.completed_at || null,
    createdAtShopify: payload.created_at || null,
    updatedAtShopify: payload.updated_at || null,
    shopDomain: req.get("x-shopify-shop-domain") || null,
    shopifyTopic: req.get("x-shopify-topic") || null,
    webhookId: req.get("x-shopify-webhook-id") || null,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    payload,
  };
}

function createWebhookHandler({ collection, eventType, normalizeData }) {
  return onRequest(
    {
      region: "us-central1",
      secrets: [VIVIRSTAR_SECRET, ZOMA_SECRET],
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async (req, res) => {
      try {
        if (req.method !== "POST") {
          return res.status(405).send("Method not allowed");
        }

        const store = getStore(req);

        if (!store) {
          return res.status(400).send("Invalid store. Use ?store=vivirstar or ?store=zoma");
        }

        const secret = getSecretForStore(store);
        const isValid = verifyShopifyWebhook(req, secret);

        if (!isValid) {
          console.error("Invalid Shopify webhook signature", {
            store,
            eventType,
            shopDomain: req.get("x-shopify-shop-domain") || null,
          });

          return res.status(401).send("Invalid Shopify signature");
        }

        const payload = req.body || {};
        const shopifyId =
          payload.id ||
          payload.token ||
          payload.cart_token ||
          req.get("x-shopify-webhook-id") ||
          Date.now();

        const documentId = `${store}_${safeId(shopifyId)}`;

        const data = normalizeData(payload, store, eventType, req);

        await db.collection(collection).doc(documentId).set(data, { merge: true });

        console.log("Shopify webhook saved", {
          store,
          eventType,
          collection,
          documentId,
        });

        return res.status(200).send("OK");
      } catch (error) {
        console.error("Webhook error", {
          eventType,
          message: error.message,
          stack: error.stack,
        });

        return res.status(500).send("Internal error");
      }
    }
  );
}

exports.shopifyOrderCreated = createWebhookHandler({
  collection: "shopify_orders",
  eventType: "order_created",
  normalizeData: normalizeOrder,
});

exports.shopifyOrderUpdated = createWebhookHandler({
  collection: "shopify_orders",
  eventType: "order_updated",
  normalizeData: normalizeOrder,
});

exports.shopifyOrderCancelled = createWebhookHandler({
  collection: "shopify_orders",
  eventType: "order_cancelled",
  normalizeData: normalizeOrder,
});

exports.shopifyCustomerCreated = createWebhookHandler({
  collection: "shopify_customers",
  eventType: "customer_created",
  normalizeData: normalizeCustomer,
});

exports.shopifyCustomerUpdated = createWebhookHandler({
  collection: "shopify_customers",
  eventType: "customer_updated",
  normalizeData: normalizeCustomer,
});

exports.shopifyCheckoutCreated = createWebhookHandler({
  collection: "shopify_abandoned",
  eventType: "checkout_created",
  normalizeData: normalizeCheckout,
});

exports.shopifyCheckoutUpdated = createWebhookHandler({
  collection: "shopify_abandoned",
  eventType: "checkout_updated",
  normalizeData: normalizeCheckout,
});

exports.shopifyDraftOrderCreated = createWebhookHandler({
  collection: "shopify_drafts",
  eventType: "draft_order_created",
  normalizeData: normalizeDraftOrder,
});

exports.shopifyDraftOrderCompleted = createWebhookHandler({
  collection: "shopify_drafts",
  eventType: "draft_order_completed",
  normalizeData: normalizeDraftOrder,
});


// ════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES — Super Admin / Ventas / Shopify / Stock
// ════════════════════════════════════════════════════════════════════════

function moneySoles(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return "S/ " + n.toFixed(2);
}

function cleanText(value, fallback = "") {
  return String(value || fallback || "").trim();
}

function productSummaryFromPayload(payload) {
  const items = payload?.line_items || payload?.lineItems || [];
  if (Array.isArray(items) && items.length) {
    return items
      .slice(0, 2)
      .map((it) => {
        const qty = it.quantity || 1;
        const name = it.title || it.name || it.product_title || "Producto";
        return `${qty}x ${name}`;
      })
      .join(", ");
  }
  return payload?.product_title || payload?.title || "";
}

function getTotalFromShopifyDoc(data) {
  return (
    data.totalPrice ||
    data.total_price ||
    data.payload?.total_price ||
    data.payload?.current_total_price ||
    data.payload?.subtotal_price ||
    ""
  );
}

function getNameFromShopifyDoc(data) {
  return (
    data.customerName ||
    data.name ||
    data.payload?.customer?.first_name && `${data.payload.customer.first_name || ""} ${data.payload.customer.last_name || ""}`.trim() ||
    data.email ||
    data.phone ||
    "Cliente"
  );
}


// ── Limpieza de tokens FCM inválidos ────────────────────────────────────
// Cuando FCM reporta un token como inválido, lo borramos de todos los usuarios
// para evitar que futuras notificaciones fallen silenciosamente.
async function cleanInvalidFcmTokens(invalidTokens) {
  if (!invalidTokens || !invalidTokens.length) return;
  const tokenSet = new Set(invalidTokens);
  try {
    const snap = await admin.firestore().collection("users").get();
    const batch = admin.firestore().batch();
    let count = 0;
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const updates = {};
      if (data.fcmTokenVentas && tokenSet.has(data.fcmTokenVentas)) {
        updates.fcmTokenVentas = admin.firestore.FieldValue.delete();
        updates.fcmTokenVentasInvalidAt = admin.firestore.FieldValue.serverTimestamp();
      }
      if (data.fcmToken && tokenSet.has(data.fcmToken)) {
        updates.fcmToken = admin.firestore.FieldValue.delete();
        updates.fcmTokenInvalidAt = admin.firestore.FieldValue.serverTimestamp();
      }
      if (Object.keys(updates).length) {
        batch.update(doc.ref, updates);
        count++;
      }
    });
    if (count) {
      await batch.commit();
      console.log("Cleaned invalid FCM tokens from", count, "users");
    }
  } catch (e) {
    console.error("cleanInvalidFcmTokens error:", e);
  }
}

async function getTokensByRoles(roles = ["superuser"]) {
  const snap = await admin.firestore().collection("users")
    .where("role", "in", roles)
    .get();

  const set = new Set();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    // fcmTokenVentas = app ventas
    // fcmToken = app stock / compatibilidad antigua
    if (typeof data.fcmTokenVentas === "string" && data.fcmTokenVentas.trim()) {
      set.add(data.fcmTokenVentas.trim());
    }
    if (typeof data.fcmToken === "string" && data.fcmToken.trim()) {
      set.add(data.fcmToken.trim());
    }
  });

  return [...set];
}

async function sendNotifToRoles(roles, title, body, data = {}) {
  const tokens = await getTokensByRoles(roles);
  if (!tokens.length) {
    console.warn("No FCM tokens found for roles:", roles);
    return;
  }

  const payload = {
    tokens,
    notification: {
      title: String(title || "Notificación"),
      body: String(body || ""),
    },
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [String(k), String(v == null ? "" : v)])
    ),
    webpush: {
      notification: {
        icon: "https://vivirstar.github.io/VivirStar/icon-192.png",
        badge: "https://vivirstar.github.io/VivirStar/icon-192.png",
        requireInteraction: true,
      },
      fcmOptions: {
        link: "https://vivirstar.github.io/VivirStar/ventas.html",
      },
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(payload);
    console.log("FCM sent:", {
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      roles,
      title,
    });

    // Limpiar tokens inválidos de Firestore para no bloquear futuras notificaciones
    const invalidTokens = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        console.error("FCM token failed:", { index: i, code, message: r.error?.message });
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          invalidTokens.push(tokens[i]);
        }
      }
    });
    if (invalidTokens.length) {
      await cleanInvalidFcmTokens(invalidTokens);
    }
  } catch (error) {
    console.error("sendNotifToRoles error:", error);
  }
}


function normalizeShopifyStoreForNotify(value) {
  const store = String(value || "").toLowerCase().trim();
  if (store === "vivirstar" || store === "vivirstar") return "vivirstar";
  if (store === "zoma" || store === "zoma") return "zoma";
  return "";
}

function getUserShopifyStoresForNotify(user) {
  const data = user || {};

  if (data.role === "superuser") {
    return [...allowedStores];
  }

  let raw =
    data.shopifyStores ||
    data.shopifyStore ||
    data.tiendaShopify ||
    data.shopify_store ||
    data.storePermission ||
    data.storePermissions ||
    [];

  if (typeof raw === "string") raw = [raw];
  if (!Array.isArray(raw)) raw = [];

  const out = [];
  raw.forEach((item) => {
    const store = normalizeShopifyStoreForNotify(item);
    if (store && !out.includes(store)) out.push(store);
  });

  return out;
}

function addUserFcmTokensToSet(user, set) {
  const data = user || {};

  if (typeof data.fcmTokenVentas === "string" && data.fcmTokenVentas.trim()) {
    set.add(data.fcmTokenVentas.trim());
  }

  if (typeof data.fcmToken === "string" && data.fcmToken.trim()) {
    set.add(data.fcmToken.trim());
  }
}

async function getTokensForShopifyStore(store) {
  const normalizedStore = normalizeShopifyStoreForNotify(store);

  if (!allowedStores.includes(normalizedStore)) {
    console.warn("Invalid Shopify store for notification:", store);
    return [];
  }

  const snap = await admin.firestore().collection("users")
    .where("role", "in", ["superuser", "admin"])
    .get();

  const set = new Set();

  snap.forEach((doc) => {
    const user = doc.data() || {};
    const role = String(user.role || "").toLowerCase().trim();

    const canReceive =
      role === "superuser" ||
      (role === "admin" && getUserShopifyStoresForNotify(user).includes(normalizedStore));

    if (canReceive) {
      addUserFcmTokensToSet(user, set);
    }
  });

  return [...set];
}

async function sendShopifyNotifToAllowedUsers(store, title, body, data = {}) {
  const normalizedStore = normalizeShopifyStoreForNotify(store);
  const tokens = await getTokensForShopifyStore(normalizedStore);

  if (!tokens.length) {
    console.warn("No FCM tokens found for Shopify store:", normalizedStore);
    return;
  }

  const payload = {
    tokens,
    notification: {
      title: String(title || "Notificación Shopify"),
      body: String(body || ""),
    },
    data: Object.fromEntries(
      Object.entries({ ...data, store: normalizedStore } || {}).map(([k, v]) => [String(k), String(v == null ? "" : v)])
    ),
    webpush: {
      notification: {
        icon: "https://vivirstar.github.io/VivirStar/icon-192.png",
        badge: "https://vivirstar.github.io/VivirStar/icon-192.png",
        requireInteraction: true,
      },
      fcmOptions: {
        link: "https://vivirstar.github.io/VivirStar/ventas.html",
      },
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(payload);
    console.log("Shopify FCM sent:", {
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      store: normalizedStore,
      title,
    });

    // Limpiar tokens inválidos para no bloquear futuras notificaciones
    const invalidTokens = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        console.error("Shopify FCM token failed:", { index: i, code, message: r.error?.message });
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          invalidTokens.push(tokens[i]);
        }
      }
    });
    if (invalidTokens.length) {
      await cleanInvalidFcmTokens(invalidTokens);
    }
  } catch (error) {
    console.error("sendShopifyNotifToAllowedUsers error:", error);
  }
}

// ── Opciones comunes para Firestore triggers de notificaciones ──────────
const NOTIF_OPTS = { region: "us-central1", timeoutSeconds: 60, memory: "256MiB" };

// ── APP STOCK: notificaciones antiguas recuperadas ──────────────────────
// Se mantienen para no perder las alertas de stock si estas funciones existían antes.
exports.notifyOnSale = onDocumentCreated({ document: "transactions/{txId}", ...NOTIF_OPTS }, async (event) => {
  const tx = event.data?.data() || {};
  if (tx.type !== "sale") return;

  const qty = tx.quantity || 1;

  await sendNotifToRoles(
    ["superuser"],
    "Venta Stock - " + cleanText(tx.model, "Producto") + " " + cleanText(tx.color),
    "T." + cleanText(tx.size) + " x " + qty + " par" + (qty !== 1 ? "es" : "") +
      " → " + cleanText(tx.buyer, "Sin cliente") + " | " + cleanText(tx.userName),
    { type: "stock_sale", collection: "transactions", id: event.params.txId }
  );
});

exports.notifyLowStock = onDocumentUpdated({ document: "products/{productId}", ...NOTIF_OPTS }, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};

  if (Number(after.stock) > 3 || Number(before.stock) <= 3 || Number(after.stock) >= Number(before.stock)) {
    return;
  }

  await sendNotifToRoles(
    ["superuser"],
    "⚠️ Stock bajo - " + cleanText(after.model, "Producto") + " " + cleanText(after.color),
    "Talla " + cleanText(after.size) + ": solo quedan " + cleanText(after.stock, "0") + " par" + (Number(after.stock) !== 1 ? "es" : ""),
    { type: "low_stock", collection: "products", id: event.params.productId }
  );
});

exports.notifyNewUser = onDocumentCreated({ document: "users/{userId}", ...NOTIF_OPTS }, async (event) => {
  const user = event.data?.data() || {};
  if (user.role === "superuser") return;

  const roles = { admin: "Administrador", vendedor: "Vendedor" };

  await sendNotifToRoles(
    ["superuser"],
    "👤 Nuevo usuario",
    cleanText(user.name || user.email, "Usuario") + " se unió como " + (roles[user.role] || cleanText(user.role, "usuario")),
    { type: "new_user", collection: "users", id: event.params.userId }
  );
});

// ── APP VENTAS: nueva venta manual ──────────────────────────────────────
exports.notifyOnOrder = onDocumentCreated({ document: "orders/{orderId}", ...NOTIF_OPTS }, async (event) => {
  const order = event.data?.data() || {};

  const qty = order.totalCantidad || 1;
  const cobrar = moneySoles(order.cobrar);
  const storeKey = normalizeShopifyStoreForNotify(order.tienda || order.store || "");
  const title = "🛒 Nueva venta - " + cleanText(order.producto, "Producto") + " x" + qty;
  const body = cleanText(order.vendedor, "Vendedor") + " → " +
    cleanText(order.cliente, "Cliente") + " | " +
    cleanText(order.zona || order.ciudad, "Zona") +
    (cobrar ? " | " + cobrar : "");

  // Notificar al Super Admin siempre; también a admins que tengan esa tienda asignada
  if (storeKey) {
    await sendShopifyNotifToAllowedUsers(
      storeKey,
      title,
      body,
      { type: "manual_order_created", collection: "orders", id: event.params.orderId }
    );
  } else {
    await sendNotifToRoles(
      ["superuser"],
      title,
      body,
      { type: "manual_order_created", collection: "orders", id: event.params.orderId }
    );
  }
});

// ── APP VENTAS: cambio de estado ────────────────────────────────────────
exports.notifyOrderStatus = onDocumentUpdated({ document: "orders/{orderId}", ...NOTIF_OPTS }, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};

  if (before.estado === after.estado) return;

  const emojis = { pendiente: "⏳", enviado: "📦", entregado: "✅", anulado: "❌" };
  const emoji = emojis[after.estado] || "🔔";
  const storeKey = normalizeShopifyStoreForNotify(after.tienda || after.store || "");
  const notifData = { type: "manual_order_status", collection: "orders", id: event.params.orderId, status: after.estado || "" };
  const title = emoji + " Pedido " + cleanText(after.estado, "actualizado").toUpperCase();
  const body = cleanText(after.cliente, "Cliente") + " - " +
    cleanText(after.producto, "Producto") + " | " +
    cleanText(after.vendedor);

  if (storeKey) {
    await sendShopifyNotifToAllowedUsers(storeKey, title, body, notifData);
  } else {
    await sendNotifToRoles(["superuser"], title, body, notifData);
  }
});

// ── SHOPIFY: pedido nuevo ───────────────────────────────────────────────
exports.notifyShopifyOrderCreated = onDocumentCreated({ document: "shopify_orders/{docId}", ...NOTIF_OPTS }, async (event) => {
  const data = event.data?.data() || {};
  const storeKey = normalizeShopifyStoreForNotify(data.store);
  const store = cleanText(storeKey, "shopify").toUpperCase();
  const total = moneySoles(getTotalFromShopifyDoc(data));
  const product = productSummaryFromPayload(data.payload);
  const orderName = cleanText(data.name || data.orderNumber || data.shopifyId, "");

  await sendShopifyNotifToAllowedUsers(
    storeKey,
    "🛍️ Nuevo pedido Shopify " + store,
    cleanText(getNameFromShopifyDoc(data), "Cliente") +
      (orderName ? " | " + orderName : "") +
      (product ? " | " + product : "") +
      (total ? " | " + total : ""),
    { type: "shopify_order_created", collection: "shopify_orders", id: event.params.docId }
  );
});

// ── SHOPIFY: carrito abandonado / checkout ──────────────────────────────
exports.notifyShopifyAbandonedCreated = onDocumentCreated({ document: "shopify_abandoned/{docId}", ...NOTIF_OPTS }, async (event) => {
  const data = event.data?.data() || {};
  const storeKey = normalizeShopifyStoreForNotify(data.store);
  const store = cleanText(storeKey, "shopify").toUpperCase();
  const total = moneySoles(getTotalFromShopifyDoc(data));
  const name = cleanText(getNameFromShopifyDoc(data), "Cliente sin nombre");

  await sendShopifyNotifToAllowedUsers(
    storeKey,
    "🛒 Carrito abandonado " + store,
    name + (total ? " | " + total : "") + (data.phone ? " | " + data.phone : ""),
    { type: "shopify_abandoned_created", collection: "shopify_abandoned", id: event.params.docId }
  );
});

// ── SHOPIFY: preliminar / draft order ───────────────────────────────────
exports.notifyShopifyDraftCreated = onDocumentCreated({ document: "shopify_drafts/{docId}", ...NOTIF_OPTS }, async (event) => {
  const data = event.data?.data() || {};
  const storeKey = normalizeShopifyStoreForNotify(data.store);
  const store = cleanText(storeKey, "shopify").toUpperCase();
  const total = moneySoles(getTotalFromShopifyDoc(data));
  const product = productSummaryFromPayload(data.payload);
  const name = cleanText(getNameFromShopifyDoc(data), "Cliente");

  await sendShopifyNotifToAllowedUsers(
    storeKey,
    "📝 Pedido preliminar " + store,
    name + (product ? " | " + product : "") + (total ? " | " + total : ""),
    { type: "shopify_draft_created", collection: "shopify_drafts", id: event.params.docId }
  );
});



// ── SHOPIFY: recordatorios programados ─────────────────────────────────
// Revisa cada 5 minutos los recordatorios pendientes y notifica al Super Admin
// y a los administradores que tengan permiso para la tienda correspondiente.
exports.notifyShopifyRemindersDue = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Lima",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    const now = admin.firestore.Timestamp.now();

    const snap = await db.collection("shopify_reminders")
      .where("reminderStatus", "==", "pending")
      .where("remindAt", "<=", now)
      .limit(50)
      .get();

    if (snap.empty) {
      console.log("No Shopify reminders due");
      return null;
    }

    const batch = db.batch();

    for (const doc of snap.docs) {
      const r = doc.data() || {};
      const storeKey = normalizeShopifyStoreForNotify(r.store);
      const storeName = cleanText(storeKey, "shopify").toUpperCase();
      const customer = cleanText(r.customerName, "Cliente");
      const phone = cleanText(r.phone, "");
      const source = cleanText(r.sourceType, "Shopify");
      const note = cleanText(r.note, "");
      const total = moneySoles(r.total);

      await sendShopifyNotifToAllowedUsers(
        storeKey,
        "⏰ Recordatorio " + storeName,
        "Llamar a " + customer +
          (phone ? " | " + phone : "") +
          (total ? " | " + total : "") +
          (note ? " | " + note : "") ,
        {
          type: "shopify_reminder_due",
          collection: "shopify_reminders",
          id: doc.id,
          sourceType: source,
        }
      );

      batch.update(doc.ref, {
        reminderStatus: "notified",
        notified: true,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    console.log("Shopify reminders notified:", snap.size);
    return null;
  }
);
