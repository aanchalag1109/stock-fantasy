<!DOCTYPE html>
<html>
<head>
    <title>Payment Success</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .success-icon {
            width: 80px;
            height: 80px;
            background: #4CAF50;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            animation: scaleIn 0.5s ease-out;
        }
        .success-icon::after {
            content: '✓';
            color: white;
            font-size: 50px;
            font-weight: bold;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        p {
            color: #666;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        .order-id {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-family: monospace;
            color: #333;
        }
        .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 15px 40px;
            border-radius: 25px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
            transition: all 0.3s;
        }
        .btn:hover {
            background: #764ba2;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        @keyframes scaleIn {
            from { transform: scale(0); }
            to { transform: scale(1); }
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon"></div>
        <h1>Payment Successful!</h1>
        <p>Your payment has been processed successfully. Coins will be added to your wallet shortly.</p>
        
        @if($order_id)
        <div class="order-id">
            Order ID: {{ $order_id }}
        </div>
        @endif
        
        <p style="font-size: 14px; color: #999;">
            <span class="loading"></span> Verifying payment...
        </p>
        
        <a href="#" class="btn" onclick="closeWindow()">Close</a>
    </div>
    
    <script>
        // Auto-close after 3 seconds
        setTimeout(function() {
            closeWindow();
        }, 3000);
        
        function closeWindow() {
            // Try deep link first
            var orderId = '{{ $order_id ?? "" }}';
            window.location.href = 'probtradeapp://payment-success?order_id=' + orderId;
            
            // Fallback: close window after 1 second
            setTimeout(function() {
                window.close();
            }, 1000);
        }
    </script>
</body>
</html>
