<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { height: 60px; margin-bottom: 20px; }
        h1 { color: #333; margin: 0; }
        .order-details { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="{{ asset('logo.png') }}" alt="Logo" class="logo">
            <h1>Order Confirmation</h1>
        </div>
        
        <p>Dear {{ $user->name }},</p>
        <p>Thank you for your order! Your order has been confirmed and is being processed.</p>
        
        <div class="order-details">
            <h3>Order Details</h3>
            <div class="detail-row">
                <span><strong>Order ID:</strong></span>
                <span>#{{ $order->id }}</span>
            </div>
            <div class="detail-row">
                <span><strong>Contest:</strong></span>
                <span>{{ $order->contest->name ?? 'N/A' }}</span>
            </div>
            <div class="detail-row">
                <span><strong>Entry Fee:</strong></span>
                <span>₹{{ $order->amount }}</span>
            </div>
            <div class="detail-row">
                <span><strong>Order Date:</strong></span>
                <span>{{ $order->created_at->format('M j, Y H:i') }}</span>
            </div>
            <div class="detail-row">
                <span><strong>Status:</strong></span>
                <span>{{ ucfirst($order->status) }}</span>
            </div>
        </div>
        
        <p>You will receive further updates about your order via email.</p>
        
        <div class="footer">
            <p>Thank you for choosing {{ config('app.name') }}!</p>
            <p>If you have any questions, please contact our support team.</p>
        </div>
    </div>
</body>
</html>