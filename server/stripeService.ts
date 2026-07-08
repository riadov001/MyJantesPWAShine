import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY_PROD || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2025-01-27.acacia" as any,
    });
  }
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY_PROD || process.env.STRIPE_SECRET_KEY);
}

export interface CreateCheckoutOptions {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  clientEmail: string;
  clientName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  paymentMethods?: string[];
}

export async function createCheckoutSession(options: CreateCheckoutOptions): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe n'est pas configuré. Veuillez ajouter STRIPE_SECRET_KEY.");
  }

  const allowedMethods = ["card", "klarna", "sepa_debit", "link"];
  const requestedMethods = options.paymentMethods || ["card"];
  const paymentMethodTypes = requestedMethods.filter((m: string) => allowedMethods.includes(m));
  if (!paymentMethodTypes.includes("card")) paymentMethodTypes.unshift("card");

  const needsBilling = paymentMethodTypes.includes("klarna");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: paymentMethodTypes as any,
    billing_address_collection: needsBilling ? "required" : "auto",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Facture ${options.invoiceNumber}`,
            description: options.description || `Paiement facture ${options.invoiceNumber}`,
          },
          unit_amount: Math.round(options.amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    customer_email: options.clientEmail,
    locale: "fr" as any,
    metadata: {
      invoiceId: options.invoiceId,
      invoiceNumber: options.invoiceNumber,
      clientName: options.clientName,
    },
  });

  return session;
}

export async function createSEPAPaymentIntent(options: {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  clientEmail: string;
  clientName: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe n'est pas configuré.");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(options.amount * 100),
    currency: "eur",
    payment_method_types: ["sepa_debit"],
    metadata: {
      invoiceId: options.invoiceId,
      invoiceNumber: options.invoiceNumber,
      clientName: options.clientName,
    },
  });

  return paymentIntent;
}

export async function retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error("[Stripe] Error retrieving session:", error);
    return null;
  }
}

export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error("[Stripe] Error retrieving payment intent:", error);
    return null;
  }
}

export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe n'est pas configuré.");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET n'est pas configuré.");
  }

  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

export interface CreatePaymentIntentOptions {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  clientEmail: string;
  clientName: string;
  paymentMethods?: string[];
}

export async function createInstallmentPaymentIntent(options: CreatePaymentIntentOptions): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe n'est pas configuré. Veuillez ajouter STRIPE_SECRET_KEY.");
  }

  const amountInCents = Math.round(options.amount * 100);

  const intentParams: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: "eur",
    payment_method_types: ["card", "klarna", "link"] as any,
    payment_method_options: {
      klarna: { preferred_locale: "fr-FR" } as any,
    },
    metadata: {
      invoiceId: options.invoiceId,
      invoiceNumber: options.invoiceNumber,
      clientName: options.clientName,
      paymentFlow: "installment",
    },
    description: `Facture ${options.invoiceNumber} - ${options.clientName}`,
    receipt_email: options.clientEmail,
  };

  const paymentIntent = await stripe.paymentIntents.create(intentParams);
  return paymentIntent;
}

export function mapStripePaymentMethod(paymentIntent: Stripe.PaymentIntent): string {
  const pmTypes = paymentIntent.payment_method_types;
  const charges = paymentIntent.latest_charge;

  if (typeof charges === "object" && charges !== null) {
    const charge = charges as any;
    const pmType = charge.payment_method_details?.type;
    if (pmType === "klarna") return "klarna";
    if (pmType === "alma") return "alma";
    if (pmType === "card") return "stripe";
    if (pmType === "sepa_debit") return "sepa";
  }

  if (pmTypes?.includes("klarna")) return "klarna";
  if (pmTypes?.includes("alma")) return "alma";

  return "stripe";
}

export async function retrievePaymentIntentWithCharge(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
  } catch (error) {
    console.error("[Stripe] Error retrieving payment intent with charge:", error);
    return null;
  }
}

export async function listPayments(options?: {
  limit?: number;
  startingAfter?: string;
}): Promise<Stripe.PaymentIntent[]> {
  const stripe = getStripe();
  if (!stripe) return [];

  try {
    const result = await stripe.paymentIntents.list({
      limit: options?.limit || 25,
      starting_after: options?.startingAfter,
    });
    return result.data;
  } catch (error) {
    console.error("[Stripe] Error listing payments:", error);
    return [];
  }
}

