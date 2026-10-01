<!DOCTYPE html>
<html>
<head>
    <title>Test Notification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        button { background: #007bff; color: white; padding: 15px 30px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; margin: 10px 0; }
        button:hover { background: #0056b3; }
        .result { padding: 15px; margin: 20px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔔 Test Notification</h1>
        
        <div id="result"></div>
        
        <button onclick="sendTestNotification()">Send Test Notification</button>
        <button onclick="sendAnnouncementNotification()">Send Announcement Notification</button>
        
        <p><strong>FCM Token:</strong><br>
        <small>cutZ14-0S0apMnVSzU1zsS:APA91bF3Z37LxVF_7-fWRabFlGckLIioMRVANH1azwloItmYrCjGN-Nj07VtcYRgqKdTmvil5A338ROnVVGpG478XCd6xWv5OBJMkiqEi6YKuKxx9Jrze_s</small></p>
    </div>

    <script>
        function sendTestNotification() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<div class="result">Sending notification...</div>';
            
            // Direct test without API call
            resultDiv.innerHTML = '<div class="result success">✅ Test notification would be sent to user 267!<br><br>To actually send:<br>1. Upload files to server<br>2. Run migration<br>3. Create announcement from admin panel</div>';
        }
        
        function sendAnnouncementNotification() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<div class="result">Sending announcement notification...</div>';
            
            // Direct test without API call
            resultDiv.innerHTML = '<div class="result success">✅ Announcement notification would be sent to all users!<br><br>To actually send:<br>1. Go to: <a href="/admin/announcements/create" target="_blank">Create Announcement</a><br>2. Fill details and submit<br>3. Check Flutter app for notification</div>';
        }
    </script>
</body>
</html>