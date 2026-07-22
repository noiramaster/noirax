import { NextRequest, NextResponse } from 'next/server';

// Live Stripe keys
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

async function getStripe() {
  const Stripe = await import('stripe');
  return new Stripe.default(stripeSecretKey);
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle checkout session creation
    if (body.price_id && body.user_id) {
      const stripe = await getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: body.price_id, quantity: 1 }],
        client_reference_id: body.user_id,
        success_url: `${request.headers.get('origin') || 'https://noirax-plum.vercel.app'}/account?success=true`,
        cancel_url: `${request.headers.get('origin') || 'https://noirax-plum.vercel.app'}/pricing?canceled=true`,
      });
      return NextResponse.json({ url: session.url });
    }

    // Handle Stripe webhook events
    const signature = request.headers.get('stripe-signature');
    if (signature) {
      const stripe = await getStripe();
      const buf = await request.text();
      // Use LIVE webhook secret
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      if (!webhookSecret) {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
      }
      const event = stripe.webhooks.constructEvent(buf, signature, webhookSecret);
      const supabase = await getSupabase();

      await supabase.from('subscriptions_events').insert({
        event_type: event.type,
        stripe_event_id: event.id,
        data: event.data.object,
        processed: true,
      });

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        await supabase
          .from('users')
          .update({
            plan: 'premium',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            subscription_status: 'active',
          })
          .eq('id', userId);
      } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const status = subscription.status === 'active' ? 'active' : 'canceled';
        await supabase
          .from('users')
          .update({ subscription_status: status, plan: status === 'active' ? 'premium' : 'free' })
          .eq('stripe_subscription_id', subscription.id);
      }

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
