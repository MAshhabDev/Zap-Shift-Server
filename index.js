const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const port = process.env.PORT || 5000

// middleware

app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion } = require('mongodb');
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

        // Parcel Api

        app.get('/parcels', async (req, res) => {

            const query = {}

            const { email } = req.query
            if (email) {
                query.senderEmail = email
            }

            const cursor = parcelCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)

        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body
            const result = await parcelCollection.insertOne(parcel)
            res.send(result)
        })

        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Zap Shift Server Is Running')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})