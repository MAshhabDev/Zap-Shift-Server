const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// middleware
app.use(cors())
app.use(express.json())

const crypto = require('crypto');

function generateTrackingId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-k50mwtj-shard-00-00.4j5c4iq.mongodb.net:27017,ac-k50mwtj-shard-00-01.4j5c4iq.mongodb.net:27017,ac-k50mwtj-shard-00-02.4j5c4iq.mongodb.net:27017/?ssl=true&replicaSet=atlas-xqdkdv-shard-0&authSource=admin&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const db = client.db("zap_shift_db");
        const parcelCollection = db.collection('parcels')
        const paymentsCollection = db.collection('payments')

        // Parcel Api
        app.get('/parcels', async (req, res) => {
            const query = {}
            const { email } = req.query
            if (email) {
                query.senderEmail = email
            }
            const result = await parcelCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollection.findOne(query)
            res.send(result)
        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body
            parcel.createdAt = new Date()
            const result = await parcelCollection.insertOne(parcel)
            res.send(result)
        })

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await parcelCollection.deleteOne(query)
            res.send(result);
        })

        // Payment Related Api

        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body
            const amount = parseInt(paymentInfo.cost) * 100;

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName
                            }
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName
                },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            });

            res.send({ url: session.url })
        })

        // ✅ FIXED: route outside
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {

                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) }


                // For stopping Duplicate Payment Entry
                const transactionId = session.payment_intent;
                const query = { transactionId: transactionId }

                const paymentExist = await paymentsCollection.findOne(query)
                if (paymentExist) {
                    return res.send({
                        message: 'already exists',
                        transactionId,
                        trackingId: paymentExist.trackingId
                    })
                }

                const trackingId = generateTrackingId()

                const update = {
                    $set: {
                        paymentStatus: 'paid',
                        trackingId: trackingId
                    }
                }

                const result = await parcelCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId, // ✅ FIXED
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId
                }

                const resultPayment = await paymentsCollection.insertOne(payment)

                res.send({
                    success: true,
                    modifyParcel: result,
                    trackingId: trackingId,
                    transactionId: session.payment_intent,
                    paymentInfo: resultPayment
                })
            }
        })

        app.get('/payments', async (req, res) => {
            const email = req.query.email;
            const query = {},
            if (email) {
                query.customerEmail = email
            }
            const cursor = paymentsCollection.findOne(query)
            const result = await cursor.toArray();
            res.send(result)
        })

        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected!");
    } finally {
        // await client.close();
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Zap Shift Server Is Running')
})

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})