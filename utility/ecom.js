
// Converted the code using Github CO-Pilot

const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const app = express();

dotenv.config();

const accessToken = process.env.META_ACCESS_TOKEN;
const MONGO_URL = "mongodb+srv://bhanupratap222333:BhanuP123@cluster0.iit03dj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const phoneNumberId = '470839449443810';
const wcUrl = process.env.wc_url;
const wcUser = process.env.consumer_key;
const wcPass = process.env.consumer_secret;


const client = new MongoClient(MONGO_URL);
let collection;

const user_data = {};

async function initializeMongo() {
  await client.connect();
  const db = client.db('Ecommerce');
  collection = db.collection('Lead_data');
}

function initializeUser(recipientId) {
  if (!user_data[recipientId]) {
    user_data[recipientId] = {};
  }
}

function storeUserData(recipientId, key, value) {
  initializeUser(recipientId);
  user_data[recipientId][key] = value;
}

async function updateMongoUserData(recipientId) {
  if (user_data[recipientId]) {
    await collection.updateOne(
      { recipient_id: recipientId },
      { $set: user_data[recipientId] },
      { upsert: true }
    );
    delete user_data[recipientId];
  }
}

function fetchUserData(recipientId, key) {
  return user_data[recipientId] ? user_data[recipientId][key] : null;
}

async function getStarted(recipientId) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const data = {
    messaging_product: 'whatsapp',
    to: recipientId,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Welcome to the fast and easy shopping experience with ABC e-commerce on WhatsApp!
        I can assist in shopping for your favourite items, click on the below button to begin🙂`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'proceed_id',
              title: 'Get Started',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'track_id',
              title: 'Track Order',
            },
          },
        ],
      },
    },
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('Message sent successfully!');
    return { status: 'success', message: 'Message sent successfully!' };
  } catch (error) {
    console.error(`Failed to send message: ${error.response.status}, ${error.response.data}`);
    return { status: 'error', message: `Failed to send message: ${error.response.status}, ${error.response.data}`, status_code: error.response.status };
  }
}

async function enterOrderId(recipientId) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const data = {
    messaging_product: 'whatsapp',
    to: recipientId,
    type: 'text',
    text: {
      body: 'Please enter your Order Id.',
    },
  };

  try {
    const response = await axios.post(url, data, { headers });
    return { success: true, message: 'Order ID request sent successfully.' };
  } catch (error) {
    return { success: false, error: error.response.data };
  }
}


async function fetchOrderStatus(orderId, recipientId) {
    const wcApiUrl = `https://ecommerce.skygoaltech.com/wp-json/wc/v3/orders/${orderId}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  
    try {
      const response = await axios.get(wcApiUrl, {
        auth: {
          username: wcUser,
          password: wcPass,
        },
      });
  
      if (response.status === 200) {
        const orderData = response.data;
        const orderStatus = orderData.status ? orderData.status.charAt(0).toUpperCase() + orderData.status.slice(1) : 'Unknown';
        const orderDate = new Date(orderData.date_created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const totalAmount = orderData.total || '0.00';
        const currencySymbol = orderData.currency_symbol || '₹';
        const billing = orderData.billing || {};
        const customerName = billing.first_name || 'Customer';
        const deliveryAddress = `${billing.address_1}, ${billing.city}, ${billing.state}, ${billing.postcode}, ${billing.country}`;
        const lineItems = orderData.line_items || [];
        let itemsText = '';
        lineItems.forEach(item => {
          itemsText += `- ${item.name} (Qty: ${item.quantity}): ${currencySymbol}${item.total}\n`;
        });
  
        const messageText = `📦 *Order Update*\n\nHello ${customerName},\nHere are your order details:\n- *Order ID*: #${orderId}\n- *Order Date*: ${orderDate}\n- *Status*: ${orderStatus}\n- *Total Amount*: ${currencySymbol}${totalAmount}\n\n🛒 *Items Ordered:*\n${itemsText}\n*Delivery Address*: ${deliveryAddress}\n\nThank you for your purchase!`;
  
        const whatsappApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
        const data = {
          messaging_product: 'whatsapp',
          to: recipientId,
          type: 'text',
          text: {
            body: messageText,
          },
        };
  
        const whatsappResponse = await axios.post(whatsappApiUrl, data, { headers });
  
        if (whatsappResponse.status === 200) {
          return { success: true, message: 'Order status message sent successfully.' };
        } else {
          return { success: false, error: whatsappResponse.data };
        }
      } else {
        return { success: false, error: 'Failed to fetch order status from WooCommerce' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
}

async function fetchProductData(productId) {
    const wcApiUrl = `https://ecommerce.skygoaltech.com/wp-json/wc/v3/products/${productId}`;
    
    try {
      const response = await axios.get(wcApiUrl, {
        auth: {
          username: wcUser,
          password: wcPass,
        },
      });
  
      if (response.status === 200) {
        return response.data.name;
      } else {
        return { error: `Failed to fetch data. Status code: ${response.status}`, details: response.data };
      }
    } catch (error) {
      return { error: `Failed to fetch data. Error: ${error.message}` };
    }
}

async function productDetail(recipientId) {
    const orderItems = fetchUserData(recipientId, 'order_info');
  
    let orderSummaryLines = [];
    let totalAmount = 0;
  
    for (const item of orderItems) {
      const productId = parseInt(item.product_retailer_id.split('_').pop());
      const productRetailerId = await fetchProductData(productId);
      const itemPrice = item.item_price;
      const quantity = item.quantity;
      const lineTotal = quantity * itemPrice;
      totalAmount += lineTotal;
  
      orderSummaryLines.push(`*Product ${productRetailerId}:*\nQuantity = *${quantity}*\nPrice = *${itemPrice} INR*\nTotal_price= *${lineTotal}INR*\n`);
    }
  
    const orderSummary = `${orderSummaryLines.join('\n')}\n\nTotal Amount = *${totalAmount} INR*`;
  
    const whatsappApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
    const data = {
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: orderSummary,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'continue_id',
                title: 'Continue',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'decline_id',
                title: 'Decline',
              },
            },
          ],
        },
      },
    };
  
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  
    try {
      const response = await axios.post(whatsappApiUrl, data, { headers });
  
      if (response.status === 200) {
        return { status: 'success', message_id: response.data.messages[0].id };
      } else {
        return { status: 'error', error: response.data };
      }
    } catch (error) {
      return { status: 'error', error: error.message };
    }
}


async function pincode(recipientId) {
    const FLOW_TOKEN = '539592998840293';
    const TEMPLATE_NAME = 'details_of_address';
    const whatsappApiUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  
    const data = {
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: {
          code: 'en',
        },
        components: [
          {
            type: 'button',
            sub_type: 'flow',
            index: '0',
            parameters: [
              {
                type: 'payload',
                payload: FLOW_TOKEN,
              },
            ],
          },
        ],
      },
    };
  
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  
    try {
      const response = await axios.post(whatsappApiUrl, data, { headers });
      return response.data;
    } catch (error) {
      return { error: error.message };
    }
}
  
async function address(recipientId, shippingAddresses) {
    const addressInfo = {
      name: shippingAddresses.name || "",
      phone_number: shippingAddresses.phone_number || "",
      address: shippingAddresses.address || "",
      city: shippingAddresses.city || "",
      state: shippingAddresses.state || "",
      in_pin_code: shippingAddresses.in_pin_code || "",
      house_number: shippingAddresses.house_number || "",
      tower_number: shippingAddresses.tower_number || "",
      building_name: shippingAddresses.building_name || "",
      landmark_area: shippingAddresses.landmark_area || "",
    };
  
    const shippingAddressesArray = [addressInfo];
    storeUserData(recipientId, 'shipping_addresses', shippingAddressesArray);
    return paymentRequest(recipientId, shippingAddressesArray);
}


function generateReferenceId() {
    const prefix = "skygoal";
    const uniqueNumber = Math.floor(Math.random() * 1000000) + 100; // Generate a random number between 100 and 1000000
    return `${prefix}-${uniqueNumber}`;
}  

async function paymentRequest(recipientId, shippingAddresses) {
    const expirationTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in seconds
    const referenceId = generateReferenceId();
    storeUserData(recipientId, 'reference_id', referenceId);
    const orderItems = fetchUserData(recipientId, 'order_info');
  
    let totalAmount = 0;
    const items = [];
  
    for (const item of orderItems) {
      const productId = item.product_retailer_id.split("_").pop();
      const productRetailerId = await fetchProductData(productId);
      const itemPrice = item.item_price;
      const quantity = item.quantity;
      const lineTotal = quantity * itemPrice * 100; // Convert to paise
      totalAmount += lineTotal;
  
      items.push({
        amount: {
          offset: "100",
          value: String(lineTotal),
        },
        sale_amount: {
          offset: "100",
          value: String(Math.min(itemPrice * 100, lineTotal)),
        },
        name: productRetailerId,
        quantity,
        country_of_origin: "India",
        importer_name: "skygoal",
        importer_address: {
          address_line1: "One BKC",
          address_line2: "Bandra Kurla Complex",
          city: "Mumbai",
          zone_code: "MH",
          postal_code: "400051",
          country_code: "IN",
        },
      });
    }
  
    const subtotal = {
      offset: "100",
      value: String(totalAmount),
    };
  
    const whatsappApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientId,
      type: "template",
      template: {
        name: "payment",
        language: {
          policy: "deterministic",
          code: "en",
        },
        components: [
          {
            type: "header",
            parameters: [],
          },
          {
            type: "body",
            parameters: [],
          },
          {
            type: "button",
            sub_type: "order_details",
            index: 0,
            parameters: [
              {
                type: "action",
                action: {
                  order_details: {
                    reference_id: referenceId,
                    type: "physical-goods",
                    currency: "INR",
                    payment_settings: [
                      {
                        type: "payment_gateway",
                        payment_gateway: {
                          type: "payu",
                          configuration_name: "e-commerce",
                        },
                      },
                    ],
                    shipping_info: {
                      country: "IN",
                      addresses: shippingAddresses,
                    },
                    order: {
                      items,
                      subtotal,
                      shipping: {
                        offset: "100",
                        value: "0",
                      },
                      tax: {
                        offset: "100",
                        value: "0",
                      },
                      discount: {
                        offset: "100",
                        value: "0",
                        description: "Additional 10% off",
                      },
                      status: "pending",
                      expiration: {
                        timestamp: String(expirationTimestamp),
                        description: "Order expiration date",
                      },
                    },
                    total_amount: {
                      offset: "100",
                      value: String(totalAmount),
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    };
  
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  
    try {
      const response = await axios.post(whatsappApiUrl, data, { headers });
  
      if (response.status === 200) {
        return { success: true, message: "Address message sent successfully." };
      } else {
        return { success: false, error: response.data };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
}

async function orderConfirmation(phone, firstName, totalAmount, status, orderId) {
    const message = `Order Confirmation! 🎉\nHello, *${firstName}* !\n\nThank you for your order Order ID: *${orderId}*.\nYour order status is: *${status}*.\n\nTotal Amount: *₹${totalAmount}* \n\nWe’re getting it ready and will update you once it’s on the way. 🚚\n\nIf you need help, just reply to this message. Thanks for choosing us! 😊`;
  
    const whatsappApiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: message,
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "home_menu",
                title: "Home Menu",
              },
            },
            {
              type: "reply",
              reply: {
                id: "status_id",
                title: "Track Order",
              },
            },
          ],
        },
      },
    };
  
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  
    try {
      const response = await axios.post(whatsappApiUrl, data, { headers });
  
      if (response.status === 200) {
        return { success: true, message: "Order confirmation message sent successfully." };
      } else {
        return { success: false, error: "Failed to send order confirmation message." };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
}

async function createWoocommerceOrder(recipientId) {
    const orderItems = fetchUserData(recipientId, 'order_info');
    const shippingInfo = fetchUserData(recipientId, 'shipping_addresses');
    const paymentsInfo = fetchUserData(recipientId, 'Payments Info');
  
    const transactionId = paymentsInfo ? paymentsInfo.transaction_id : "";
    const transactionStatus = paymentsInfo ? paymentsInfo.transaction_status : "";
    const paymentMethod = paymentsInfo ? paymentsInfo.payment_method : "";
  
    const shippingDefaults = {
      name: "",
      phone_number: recipientId,
      address: "",
      city: "",
      state: "State not found",
      in_pin_code: "",
      house_number: "",
      tower_number: "",
      building_name: "",
      landmark_area: "",
    };
  
    if (shippingInfo) {
      for (const shipping of shippingInfo) {
        shippingDefaults.name = shipping.name || shippingDefaults.name;
        shippingDefaults.address = shipping.address || shippingDefaults.address;
        shippingDefaults.city = shipping.city || shippingDefaults.city;
        shippingDefaults.state = shipping.state || shippingDefaults.state;
        shippingDefaults.in_pin_code = shipping.in_pin_code || shippingDefaults.in_pin_code;
        shippingDefaults.house_number = shipping.house_number || shippingDefaults.house_number;
        shippingDefaults.tower_number = shipping.tower_number || shippingDefaults.tower_number;
        shippingDefaults.building_name = shipping.building_name || shippingDefaults.building_name;
        shippingDefaults.landmark_area = shipping.landmark_area || shippingDefaults.landmark_area;
      }
    }
  
    const lineItems = orderItems.map(item => ({
      product_id: item.product_retailer_id.split('_').pop(),
      quantity: item.quantity,
    }));
  
    const orderData = {
      payment_method: paymentMethod,
      payment_method_title: transactionStatus,
      set_paid: true,
      billing: {
        first_name: shippingDefaults.name,
        address_1: shippingDefaults.address,
        city: shippingDefaults.city,
        state: shippingDefaults.state,
        postcode: String(shippingDefaults.in_pin_code),
        country: 'IN',
        phone: shippingDefaults.phone_number,
        house_number: shippingDefaults.house_number,
        tower_number: shippingDefaults.tower_number,
        building_name: shippingDefaults.building_name,
        landmark_area: shippingDefaults.landmark_area,
      },
      shipping: {
        first_name: shippingDefaults.name,
        address_1: shippingDefaults.address,
        city: shippingDefaults.city,
        state: shippingDefaults.state,
        postcode: String(shippingDefaults.in_pin_code),
        country: 'IN',
        phone: shippingDefaults.phone_number,
        house_number: shippingDefaults.house_number,
        tower_number: shippingDefaults.tower_number,
        building_name: shippingDefaults.building_name,
        landmark_area: shippingDefaults.landmark_area,
      },
      line_items: lineItems,
    };
  
    await updateMongoUserData(recipientId);
  
    try {
      const response = await axios.post(wcUrl, orderData, {
        auth: {
          username: wcUser,
          password: wcPass,
        },
      });
  
      if (response.status === 201) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
}


async function getPostOfficeInfo(recipientId, responseData) {
    const pincode = responseData.screen_0_TextInput_1.trim();
    const name = responseData.screen_0_TextInput_0.trim();
    const address = responseData.screen_0_TextInput_2.trim();
    const landmark = responseData.screen_0_TextInput_3.trim();
  
    const apiUrl = "https://bots-findcanteen.q07dqw.easypanel.host/get_post_office";
    const params = { pincode };
  
    try {
      const response = await axios.get(apiUrl, { params });
      const data = response.data;
  
      if (data.post_office) {
        const addressInfo = {
          name,
          phone_number: recipientId,
          address,
          city: data.District,
          state: data.State,
          in_pin_code: data.pincode,
          house_number: "",
          tower_number: "",
          building_name: "",
          landmark_area: landmark,
        };
  
        const shippingAddresses = [addressInfo];
        storeUserData(recipientId, 'shipping_addresses', shippingAddresses);
        return paymentRequest(recipientId, shippingAddresses);
      }
    } catch (error) {
      return { error: error.message };
    }
}

async function nextAddress(recipientId, responseData) {
    const addressInfo = {
      name: responseData.name.trim(),
      phone_number: responseData.phone_number.trim(),
      address: responseData.address.trim(),
      city: responseData.city.trim(),
      state: responseData.state.trim() || "State not found",
      in_pin_code: responseData.in_pin_code.trim(),
      house_number: responseData.house_number.trim(),
      tower_number: responseData.tower_number.trim(),
      building_name: responseData.building_name.trim(),
      landmark_area: responseData.landmark_area.trim(),
    };
  
    const phoneNumber = addressInfo.phone_number.trim();
    if (phoneNumber && phoneNumber.length === 10) {
      addressInfo.phone_number = "91" + phoneNumber;
    }
  
    const shippingAddresses = [addressInfo];
    console.log("Shipping Addresses:", shippingAddresses);
  
    storeUserData(recipientId, 'shipping_addresses', shippingAddresses);
    return paymentRequest(recipientId, shippingAddresses);
}


async function cancelOrderInfo(recipientId) {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  
    const payload = {
      messaging_product: "whatsapp",
      to: recipientId,
      type: "template",
      template: {
        name: "cancellation_of_order",
        language: { code: 'en' },
        components: [
          {
            type: "button",
            sub_type: "flow",
            index: 0,
            parameters: []
          }
        ]
      }
    };
  
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    };
  
    const response = await axios.post(url, payload, { headers });
    return response.data;
}


async function cancelOrder(orderId) {
    const storeUrl = "https://ecommerce.skygoaltech.com";
    const url = `${storeUrl}/wp-json/wc/v3/orders/${orderId}`;
  
    const data = {
      status: "cancelled"
    };
  
    const response = await axios.put(url, data, {
      auth: {
        username: wcUser,
        password: wcPass
      }
    });
  
    return response.data;
}

async function cancelOrderConfirmation(orderId, phone, totalAmount) {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    };
  
    const data = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        body: `Your order ${orderId} has been successfully canceled, and we are processing your refund of Rs ${totalAmount}. 
  The refund will be credited to your original payment method within 7 days.`
      }
    };
  
    const response = await axios.post(url, data, { headers });
  
    if (response.status === 200) {
      return { success: true, message: "Order ID request sent successfully." };
    } else {
      return { success: false, error: response.data };
    }
}


function generateHash(merchantKey, command, mihpayid, salt) {
    const hashSequence = `${merchantKey}|${command}|${mihpayid}|${salt}`;
    return crypto.createHash('sha512').update(hashSequence).digest('hex');
}


async function refundTransaction(phone, totalAmount, transaction) {
    const mihpayid = transaction;
    const tokenId = uuidv4();
    const refundAmount = totalAmount;
    const merchantKey = "kPFnBJ";
    const salt = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxQyxletw5kE/0R+8uNEHOobYHYygYpp27YLnf9WAc4sz1+nMMwh9+y4OyTvqvUQh+I7+Lk85XoVVAUDLLu0IsyvJ1hCEQjJH7WkUqk4XZF+r8/X4Fxzr0Wf4CfLZbLn7PO6lOjhGK4bPoViFuQJ8BVtGEhFp6ed169jRGMmTOj44Mno9eFbbzwpB0Rh40SLUuIjf8HGHTX8cJ1vipFNEP7ASH56kHxdOZXDZ35WSjZx2j7VQua5rmCCwRL/XYAkLpzVWLVFTixpUt7U+IBSJ7saTEKfITConb3s6BugNdB4Vnos380hiOi9bS5FIkjrM/GJ5t5+2APJoZyuoaBLJnAgMBAAECggEAe6oqWe25n+se7IQWx/wrANXuYP77JR9wIR4c7rKHx/8uEFkWVItFX7bpfMb+urpkm2OjKOQH6zihegm5NkrAovE+718rlhkLaviSEl7y3P6DsNXESpGwfnId9Gw+6CPq0faEakpQ0LwfP/J+xiUNCOkhqDqRyKomKreCxoo3q6ZvRODXddTQM2u9s8C/1RGM5Utmhu8aJyj88LJS96wiULo/IVR0EaGV6TxGFJHJcJHakN0LaaJtwvW2X0i2H4lpXMfSvr2cRUpsMEG+iuAM/HxAn75LAY25tEn+Pj4M4tWf1iIC3PlN2jKwu2hpo6ZzM5ddlsdgfkgHY76aa9TCoQKBgQDglNkCh+ssMWwV4etGH9yiQKalw7FVirhJkrRg3Lftl8tgk8sOR2aRIZG+2n6IBdbsrP9LDgsAAIs9vICWMNbcKUCVFKo0K1JJC70dLutE+qOrPYH24KWqsc+I9G44MRB8mSqT9v9U2hDbn6/ZN4Hg8e6zRpDxaewcf3aChFZpcQKBgQDKD6SlwTfXA1VY2caDUgiLDDWWioPvk0penwtqDCR7hXNNSUh9FidIGJqU0MCqvGsuENbjGUGPnhWrSUjfcQ/K2mlPycKNJS7e2cCIjK1mFPSdjF+XQ3qHJSgOZ4FtbOPjFhKhLS3Ru9WtV8iZLUiJnNer1l1a5PRp/A7Lcv4tVwKBgDn89RO8OLMOh9QWo4NV0shqXR1MLEvkJ7WHld+03iERIshrIPEs6oTq4BEhpa5Fo7s06C5fD+QOP+XO+HzPW4s5c52K2m/iB7sotsoERWdoOD6NATPXya8LfoTkaFlGAfXKLr5J9p/YNqYe028I8BY/Id1UiTRsnzS0jMsilJVhAoGAHqS+sJCb+lS8Fcx5KaNAPm4sllcNaUDqL21pWrzar4zujpMFlkrMzEdG8jiyb3JBwuu02x4SbkhoOuDTV2ebIIV9ISeVBLjV4eAeLdc/2NJmwpnuSU9nfqVo7L5Px5uS9/Z5/s2OPFeDMVW1y10tugj6QEozQDymwIgEamBXIeMCgYEA34BcE+rd6UHL5te29KAT4A2uanfDxcmJXkHmcleAQ1HOf/Fu5wCLJ7WM8KvoxIN/St2QM45D55vH2i8MwHlcMvEoeBHWxD//0VJN1KSYAg9IHI3zlIEdXIFhPVG5t+ozzO2emlsl1MjPXkF3uDnOnW70VkAuIMYCjjYx09XfsSA=`"
    const refundWebhookUrl = "https://www.example.com";
    const command = "cancel_refund_transaction";
    const hash = generateHash(merchantKey, command, mihpayid, salt);
    const url = "https://info.payu.in/merchant/postservice.php";
  
    const formData = new URLSearchParams({
      key: merchantKey,
      salt: salt,
      command: command,
      var1: mihpayid,
      var2: tokenId,
      var3: refundAmount.toString(),
      var5: refundWebhookUrl,
      hash: hash,
    });
  
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
  
    const response = await axios.post(url, formData, { headers });
    return response.data;
}


const MERCHANT_KEY = "kPFnBJ";
const PAYU_SALT = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxQyxletw5kE/0R+8uNEHOobYHYygYpp27YLnf9WAc4sz1+nMMwh9+y4OyTvqvUQh+I7+Lk85XoVVAUDLLu0IsyvJ1hCEQjJH7WkUqk4XZF+r8/X4Fxzr0Wf4CfLZbLn7PO6lOjhGK4bPoViFuQJ8BVtGEhFp6ed169jRGMmTOj44Mno9eFbbzwpB0Rh40SLUuIjf8HGHTX8cJ1vipFNEP7ASH56kHxdOZXDZ35WSjZx2j7VQua5rmCCwRL/XYAkLpzVWLVFTixpUt7U+IBSJ7saTEKfITConb3s6BugNdB4Vnos380hiOi9bS5FIkjrM/GJ5t5+2APJoZyuoaBLJnAgMBAAECggEAe6oqWe25n+se7IQWx/wrANXuYP77JR9wIR4c7rKHx/8uEFkWVItFX7bpfMb+urpkm2OjKOQH6zihegm5NkrAovE+718rlhkLaviSEl7y3P6DsNXESpGwfnId9Gw+6CPq0faEakpQ0LwfP/J+xiUNCOkhqDqRyKomKreCxoo3q6ZvRODXddTQM2u9s8C/1RGM5Utmhu8aJyj88LJS96wiULo/IVR0EaGV6TxGFJHJcJHakN0LaaJtwvW2X0i2H4lpXMfSvr2cRUpsMEG+iuAM/HxAn75LAY25tEn+Pj4M4tWf1iIC3PlN2jKwu2hpo6ZzM5ddlsdgfkgHY76aa9TCoQKBgQDglNkCh+ssMWwV4etGH9yiQKalw7FVirhJkrRg3Lftl8tgk8sOR2aRIZG+2n6IBdbsrP9LDgsAAIs9vICWMNbcKUCVFKo0K1JJC70dLutE+qOrPYH24KWqsc+I9G44MRB8mSqT9v9U2hDbn6/ZN4Hg8e6zRpDxaewcf3aChFZpcQKBgQDKD6SlwTfXA1VY2caDUgiLDDWWioPvk0penwtqDCR7hXNNSUh9FidIGJqU0MCqvGsuENbjGUGPnhWrSUjfcQ/K2mlPycKNJS7e2cCIjK1mFPSdjF+XQ3qHJSgOZ4FtbOPjFhKhLS3Ru9WtV8iZLUiJnNer1l1a5PRp/A7Lcv4tVwKBgDn89RO8OLMOh9QWo4NV0shqXR1MLEvkJ7WHld+03iERIshrIPEs6oTq4BEhpa5Fo7s06C5fD+QOP+XO+HzPW4s5c52K2m/iB7sotsoERWdoOD6NATPXya8LfoTkaFlGAfXKLr5J9p/YNqYe028I8BY/Id1UiTRsnzS0jMsilJVhAoGAHqS+sJCb+lS8Fcx5KaNAPm4sllcNaUDqL21pWrzar4zujpMFlkrMzEdG8jiyb3JBwuu02x4SbkhoOuDTV2ebIIV9ISeVBLjV4eAeLdc/2NJmwpnuSU9nfqVo7L5Px5uS9/Z5/s2OPFeDMVW1y10tugj6QEozQDymwIgEamBXIeMCgYEA34BcE+rd6UHL5te29KAT4A2uanfDxcmJXkHmcleAQ1HOf/Fu5wCLJ7WM8KvoxIN/St2QM45D55vH2i8MwHlcMvEoeBHWxD//0VJN1KSYAg9IHI3zlIEdXIFhPVG5t+ozzO2emlsl1MjPXkF3uDnOnW70VkAuIMYCjjYx09XfsSA=";
const PAYU_URL = "https://info.payu.in/merchant/postservice.php?form=2";

function generateHash(command, var1, salt) {
    // Generate the hash for PayU API requests
    const hashString = `${MERCHANT_KEY}|${command}|${var1}|${salt}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
}


async function getTransactionDetails(txnid) {
  const command = "verify_payment";
  const hashValue = generateHash(command, txnid, PAYU_SALT);

  const payload = new URLSearchParams({
    key: MERCHANT_KEY,
    command: command,
    var1: txnid,
    hash: hashValue,
  });

  const response = await axios.post(PAYU_URL, payload);
  const responseData = response.data;

  const txnDetails = responseData.transaction_details[txnid];
  const mihpayid = txnDetails.mihpayid;
  return mihpayid;
}


// Export all functions
module.exports = {
  initializeMongo,
  initializeUser,
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
  getTransactionDetails
};