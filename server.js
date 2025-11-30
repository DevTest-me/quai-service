const express = require('express');
const quais = require('quais');
const https = require('https');
const http = require('http');
const app = express();

// Allow your Android app to connect
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Quai Service is running!' });
});

// Helper function to make RPC calls directly
function makeRpcCall(rpcUrl, method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(rpcUrl);
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000 // 30 second timeout
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Main transaction signing endpoint
app.post('/sign-transaction', async (req, res) => {
  try {
    const { privateKey, to, value, nonce, gasPrice, gasLimit, chainId, rpcUrl } = req.body;
    
    console.log('📥 Received transaction request');
    console.log('From PK (first 10 chars):', privateKey.substring(0, 10) + '...');
    console.log('To:', to);
    console.log('Value:', value, 'Wei');
    console.log('Nonce:', nonce);
    console.log('Chain ID:', chainId);
    console.log('RPC:', rpcUrl);
    
    // Create provider
    const provider = new quais.JsonRpcProvider(rpcUrl, {
      chainId: parseInt(chainId),
      name: 'quai-cyprus1'
    });
    
    // Create wallet
    const wallet = new quais.Wallet(privateKey);
    const connectedWallet = wallet.connect(provider);
    
    console.log('✅ Wallet address:', connectedWallet.address);
    
    // Build transaction
    const tx = {
      to: to,
      from: connectedWallet.address,
      value: value,
      nonce: parseInt(nonce),
      gasPrice: gasPrice,
      gasLimit: parseInt(gasLimit),
      chainId: parseInt(chainId)
    };
    
    console.log('📝 Transaction object:', JSON.stringify(tx, null, 2));
    
    // Sign transaction
    console.log('🔐 Signing transaction with quais.js (Protobuf encoding)...');
    const signedTx = await connectedWallet.signTransaction(tx);
    console.log('✅ Transaction signed successfully!');
    console.log('Signed TX (Protobuf):', signedTx.substring(0, 150) + '...');
    console.log('Full signed TX length:', signedTx.length, 'chars');
    
    // Broadcast using direct RPC call instead of quais.js
    console.log('📤 Broadcasting via direct RPC call...');
    
    try {
      const txHash = await makeRpcCall(rpcUrl, 'quai_sendRawTransaction', [signedTx]);
      
      console.log('✅ Transaction broadcasted successfully!');
      console.log('TX Hash:', txHash);
      
      res.json({ 
        success: true,
        txHash: txHash 
      });
      
    } catch (broadcastError) {
      console.error('❌ Broadcast error:', broadcastError.message);
      
      // Even if broadcast fails, we have the signed transaction
      // The user can manually broadcast it or check if it went through
      res.status(500).json({ 
        success: false,
        error: broadcastError.message,
        signedTransaction: signedTx, // Return signed tx so it can be manually broadcasted if needed
        info: 'Transaction was signed but broadcast failed. The signed transaction is included in the response.'
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Quai encoding service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Sign endpoint: http://localhost:${PORT}/sign-transaction`);
});
