const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// middleware
app.use(cors())
app.use(express.json())




const admin = require("firebase-admin");

const serviceAccount = require("./zap-shift-e22aa.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Create Custom Middleware

const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization
    if (!token) {
        return res.status(401).send({ message: "Unauthorized Access" })
    }
    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.decoded_email = decoded.email;
        next()

    }
    catch {
        return res.status(401).send({ message: "Unauthorized" })

    }
}


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
        const usersCollection = db.collection('users')
        const ridersCollection = db.collection('riders')

        // Mdille Admin Before Allwoing Admin Activity
        // Must be used after verify token middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await usersCollection.findOne(query);

            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: "Forbidden" });
            }

            next();
        };

        // Parcel Api
        app.get('/parcels', async (req, res) => {
            const query = {}
            const { email, deliveryStatus } = req.query
            if (email) {
                query.senderEmail = email
            }
            if (deliveryStatus) {
                query.deliveryStatus = deliveryStatus
            }
            const result = await parcelCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/parcels/rider', async (req, res) => {
            const query = {}
            const { riderEmail, deliveryStatus } = req.query
            if (riderEmail) {
                query.riderEmail = riderEmail
            }

            if (deliveryStatus) {
                query.deliveryStatus = deliveryStatus
            }

            const cursor = parcelCollection.find(query)
            const result = await cursor.toArray();
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

        app.patch('/parcels/:id', async (req, res) => {
            const { riderId, riderName, riderEmail } = req.body
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    deliveryStatus: 'driver_assigned',
                    riderId: riderId,
                    riderName: riderName,
                    riderEmail: riderEmail
                }
            }
            const result = await parcelCollection.updateOne(query, updatedDoc)

            // Update Rider Information   Ektar bhitor thekei dui jaigai update

            const riderQuery = { _id: new ObjectId(riderId) }
            const riderUpdate = {
                $set: {
                    workStatus: 'in_delivery'
                }
            }
            const riderResult = await ridersCollection.updateOne(riderQuery, riderUpdate)

            res.send({
                parcelUpdate: result,
                riderUpdate: riderResult
            })
        })

        // Users Related Api

        app.get('/users', verifyToken, async (req, res) => {
            const searchText = req.query.searchText;
            const query = {}
            if (searchText) {
                // query.displayName = searchText

                query.$or = [
                    { displayName: { $regex: searchText, $options: 'i' } },
                    { email: { $regex: searchText, $options: 'i' } }
                ]
            }


            const cursor = usersCollection.find(query).limit(5);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.get('/users/:id', async (req, res) => {

        })

        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const user = await usersCollection.findOne(query)
            res.send({ role: user?.role || 'user' })
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'user';
            user.createdAt = new Date()
            const email = user.email;
            const userExists = await usersCollection.findOne({ email })
            if (userExists) {
                return res.send({ message: "User Exists" })
            }

            const result = await usersCollection.insertOne(user)
            res.send(result)
        });

        app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: roleInfo.role
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // Riders Related Api

        app.get('/riders', async (req, res) => {

            const { status, district, workStatus } = req.query
            const query = {};
            if (req.query.status) {
                query.status = req.query.status;

            }
            if (district) {
                query.district = district
            }
            if (workStatus) {
                query.workStatus = workStatus
            }
            const cursor = ridersCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.patch('/riders/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {


                const status = req.body.status;
                const email = req.body.email;
                const id = req.params.id;

                const query = { _id: new ObjectId(id) };

                const updateDoc = {
                    $set: {
                        status: status,
                        workStatus: status === 'approved' ? 'available' : 'unavailable'
                    }
                };

                if (status === 'approved') {
                    const userQuery = { email: email };
                    const updateUser = {
                        $set: {
                            role: 'rider'
                        }
                    };

                    await usersCollection.updateOne(userQuery, updateUser);
                }

                const result = await ridersCollection.updateOne(query, updateDoc);
                res.send(result);

            } catch (error) {
                console.error('PATCH /riders/:id error:', error.message);

                res.status(500).send({
                    message: 'Failed to update rider',
                    error: error.message
                });
            }
        });

        app.post('/riders', async (req, res) => {
            const rider = req.body;
            rider.status = 'pending';
            rider.createdAt = new Date()
            const result = await ridersCollection.insertOne(rider);
            res.send(result)
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
                const payQuery = { transactionId: transactionId }

                const paymentExist = await paymentsCollection.findOne(payQuery)
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
                        deliveryStatus: 'pending-pickup',
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

        app.get('/payments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.customerEmail = email
                if (email !== req.decoded_email) {
                    return res.status(403).send({ message: "Forbidden" })
                }
            }
            const cursor = paymentsCollection.find(query).sort({ paidAt: -1 })
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