const express = require('express');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const winston = require('winston');

const { initializeUser,
    storeUserData,
    updateMongoUserData,
    fetchUserData,
    getStarted,
    enterOrderId,
    fetchOrderStatus,
    fetchProductData,
    productDetail,
    pincode,
    address,
    generateReferenceId,
    paymentRequest,
    orderConfirmation,
    createWoocommerceOrder,
    getPostOfficeInfo,
    nextAddress,
    cancelOrderInfo,
    cancelOrder,
    cancelOrderConfirmation,
    generateHash,
    refundTransaction,
    getTransactionDetails } = require('./utility/ecom');

const catalog = require('./utility/catalog');

// Suppress all CryptographyDeprecationWarnings
// Not typically needed in Node.js, but ensure warnings are handled appropriately

// Configure logging
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Initialize Express app
const app = express();

// Load environment variables
dotenv.config();
const MONGO_URL = process.env.MONGO_URL;
const PROJECT_ID = process.env.PROJECT_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '1234';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_API_URL = "https://graph.facebook.com/v21.0/470839449443810/messages";

const client = new MongoClient(MONGO_URL);
let db, collection;

(async () => {
  try {
    await client.connect();
    db = client.db("Ecommerce");
    collection = db.collection("Lead_data");
  } catch (err) {
    logger.error("Failed to connect to MongoDB", err);
  }
})();

// Middleware to parse JSON and urlencoded request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Define constants for status codes and messages
const STATUS_SUCCESS = "success";
const STATUS_ERROR = "error";
const MESSAGE_ORDER_PROCESSED_SUCCESS = "Order processed and message sent successfully";
const MESSAGE_ORDER_PROCESSED_FAILURE = "Order processed but failed to send message";
const MESSAGE_ORDER_ID_NOT_FOUND = "Order ID not found";
const MESSAGE_INTERNAL_SERVER_ERROR = "Internal Server Error";
const MESSAGE_INVALID_CONTENT_TYPE = "Invalid Content-Type";


// Function to send response
function sendResponse(res, statusCode, status, message) {
  return res.status(statusCode).json({ status, message });
}


app.get('/webhook', (req, res) => {
  logger.debug("GET request for webhook verification");
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    logger.info("Webhook token verified successfully");
    res.send(req.query['hub.challenge']);
  } else {
    logger.warn("Invalid verification token");
    res.status(403).send('Error, wrong validation token');
  }
});

app.post('/webhook', async (req, res) => {
  logger.debug("Webhook POST request received");
  try {
    const reqBody = req.body;
    logger.debug(`Request JSON: ${JSON.stringify(reqBody, null, 2)}`);

    if (reqBody.entry && reqBody.entry.length > 0) {
      const entry = reqBody.entry[0];
      logger.debug(`Entry data: ${JSON.stringify(entry)}`);

      if (entry.changes && entry.changes.length > 0) {
        const change = entry.changes[0];
        const value = change.value;
        logger.debug(`Change value: ${JSON.stringify(value)}`);

        if (value.messages && value.messages.length > 0) {
          const message = value.messages[0];
          const recipientId = value.contacts[0].wa_id;
          logger.info(`Message received from recipient: ${recipientId}`);

          if (message.text) {
            logger.info("Text message detected");
            const messageText = message.text.body.toLowerCase();
            const orderIdMatch = messageText.match(/\b\d{4,}\b/);
            if (orderIdMatch) {
              const orderId = orderIdMatch[0];
              return res.json(await fetchOrderStatus(orderId, recipientId));
            } else {
              initializeUser(recipientId);
              return res.json(await getStarted(recipientId));
            }
          } else if (message.interactive) {
            logger.info("Interactive message detected");
            const interactive = message.interactive;

            if (interactive.button_reply) {
              const title = interactive.button_reply.title;
              logger.debug(`Button title: ${title}`);
              switch (title) {
                case "Get Started":
                  return res.json(await catalog(recipientId));
                case "Continue":
                  const document = await collection.findOne({ recipient_id: recipientId }, { projection: { shipping_addresses: 1 } });
                  if (document) {
                    for (const shippingAddress of document.shipping_addresses) {
                      return res.json(await address(recipientId, shippingAddress));
                    }
                  } else {
                    return res.json(await pincode(recipientId));
                  }
                  break;
                case "Decline":
                case "Home Menu":
                  return res.json(await getStarted(recipientId));
                case "Add more items":
                  return res.json(await catalog(recipientId));
                case "Track Order":
                  return res.json(await enterOrderId(recipientId));
                default:
                  break;
              }
            }

            if (interactive.nfm_reply) {
              const responseJson = interactive.nfm_reply.response_json;
              const responseData = JSON.parse(responseJson);
              logger.debug(`Response data: ${JSON.stringify(responseData)}`);
              const flowToken = responseData.flow_token || "";

              if (flowToken === 'unused') {
                return res.json(await getPostOfficeInfo(recipientId, responseData));
              } else {
                return res.json(await nextAddress(recipientId, responseData));
              }
            }
          }

          if (message.order) {
            logger.info("Order message detected");
            const orderItems = message.order.product_items;

            const productsInfo = orderItems.map(item => ({
              product_retailer_id: item.product_retailer_id,
              quantity: item.quantity,
              item_price: item.item_price,
              currency: item.currency
            }));

            storeUserData(recipientId, 'order_info', productsInfo);
            logger.debug(`Stored order info for ${recipientId}: ${JSON.stringify(fetchUserData(recipientId, 'order_info'))}`);

            return res.json(await productDetail(recipientId));
          }
        }

        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            if (status.type === 'payment') {
              const recipientId = status.recipient_id || "unknown";
              const paymentInfo = {
                payment_status: status.status || 'unknown',
                reference_id: status.payment.reference_id || '',
                amount: `${Math.floor(status.payment.amount.value / 100)} ${status.payment.currency}`,
                transaction_id: status.payment.transaction.id || '',
                transaction_status: status.payment.transaction.status || '',
                payment_method: status.payment.transaction.method.type || 'unknown'
              };
              logger.debug(`Payment info: ${JSON.stringify(paymentInfo)}`);
              storeUserData(recipientId, 'Payments Info', paymentInfo);

              if (paymentInfo.transaction_status === 'success') {
                return res.json(await createWoocommerceOrder(recipientId));
              }
            }
          }
        }
        return res.status(400).json({ status: 'error', message: 'No messages in request' });
      }
      return res.status(400).json({ status: 'error', message: 'No changes in entry' });
    }
    return res.status(400).json({ status: 'error', message: 'Invalid entry structure' });
  } catch (e) {
    logger.error("An error occurred while processing the request", e);
    return res.status(500).json({ status: 'error', message: 'An error occurred while processing the request' });
  }
});

app.post('/order_status', async (req, res) => {
  logger.debug("Order status webhook POST request received");
  if (req.is('application/json') || req.is('application/x-www-form-urlencoded')) {
    try {
      const data = req.body;
      logger.debug(`Order status data: ${JSON.stringify(data)}`);

      const orderId = data.id;
      if (orderId) {
        const billingInfo = data.billing || {};
        const phone = billingInfo.phone || '';
        const totalAmount = data.total || '0.00';
        const firstName = billingInfo.first_name || 'Customer';
        let status = data.status || "";
        if (status === 'arrival-shipment') {
          status = "shipped";
        }

        if (await orderConfirmation(phone, firstName, totalAmount, status, orderId)) {
          logger.info(`Order ${orderId} processed and message sent successfully`);
          return sendResponse(res, 200, STATUS_SUCCESS, `Order ${orderId} ${MESSAGE_ORDER_PROCESSED_SUCCESS}`);
        } else {
          logger.warn(`Order ${orderId} processed but failed to send message`);
          return sendResponse(res, 500, STATUS_ERROR, MESSAGE_ORDER_PROCESSED_FAILURE);
        }
      } else {
        logger.warn("Order ID not found in request");
        return sendResponse(res, 400, STATUS_ERROR, MESSAGE_ORDER_ID_NOT_FOUND);
      }
    } catch (err) {
      logger.error("An error occurred during order status processing", err);
      return sendResponse(res, 500, STATUS_ERROR, MESSAGE_INTERNAL_SERVER_ERROR);
    }
  } else {
    logger.warn("Invalid Content-Type in request");
    return sendResponse(res, 415, STATUS_ERROR, MESSAGE_INVALID_CONTENT_TYPE);
  }
  
});

app.get('/ping', (req, res) => {
  logger.info("Ping request received");
  res.send('<h1>Welcome to E-commerce Bot</h1>');
});


const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
