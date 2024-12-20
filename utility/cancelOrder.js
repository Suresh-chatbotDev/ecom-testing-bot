const axios = require('axios');
const dotenv = require('dotenv');
const qs = require('qs');

// Load environment variables
dotenv.config();

async function cancelOrder(orderId) {
  // Replace these values with your store URL, Consumer Key, and Consumer Secret
  const storeUrl = "https://ecommerce.skygoaltech.com";
  const consumerKey = process.env.consumer_key;
  const consumerSecret = process.env.consumer_secret;

  // Endpoint to update order
  const url = `${storeUrl}/wp-json/wc/v3/orders/${orderId}`;

  // Payload to cancel the order
  const data = {
    status: "cancelled"
  };

  // Basic Auth credentials
  const auth = {
    username: consumerKey,
    password: consumerSecret
  };

  try {
    // Send the PUT request to cancel the order
    const response = await axios.put(url, data, { auth });

    // Check if the request was successful
    if (response.status === 200) {
      console.log("Order cancelled successfully!");
    } else {
      console.log(`Failed to cancel order: ${response.status}`, response.data);
    }
  } catch (error) {
    console.error(`Error: ${error.response ? error.response.data : error.message}`);
  }
}

// Example usage
// const orderId = '12345'; // Replace with the actual order ID
// cancelOrder(orderId);