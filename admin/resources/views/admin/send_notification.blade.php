<!DOCTYPE html>
<html>
<head>
    <title>Send Notification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input, textarea, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        textarea { height: 100px; resize: vertical; }
        button { background: #007bff; color: white; padding: 12px 30px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
        button:hover { background: #0056b3; }
        .alert { padding: 15px; margin: 20px 0; border-radius: 4px; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .user-ids { display: none; }
        .user-ids.show { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Send Push Notification</h1>
        
        <div id="message"></div>
        
        <form id="notificationForm">
            <div class="form-group">
                <label for="title">Title:</label>
                <input type="text" id="title" name="title" required>
            </div>
            
            <div class="form-group">
                <label for="message">Message:</label>
                <textarea id="messageText" name="message" required></textarea>
            </div>
            
            <div class="form-group">
                <label for="type">Send To:</label>
                <select id="type" name="type" onchange="toggleUserIds()">
                    <option value="all">All Users</option>
                    <option value="specific">Specific Users</option>
                </select>
            </div>
            
            <div class="form-group user-ids" id="userIdsGroup">
                <label for="user_ids">User IDs (comma separated):</label>
                <input type="text" id="user_ids" name="user_ids" placeholder="1,2,3,4">
            </div>
            
            <button type="submit">Send Notification</button>
        </form>
    </div>

    <script>
        function toggleUserIds() {
            const type = document.getElementById('type').value;
            const userIdsGroup = document.getElementById('userIdsGroup');
            
            if (type === 'specific') {
                userIdsGroup.classList.add('show');
            } else {
                userIdsGroup.classList.remove('show');
            }
        }

        document.getElementById('notificationForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = {
                title: formData.get('title'),
                message: formData.get('message'),
                type: formData.get('type')
            };
            
            if (data.type === 'specific') {
                const userIds = formData.get('user_ids');
                if (userIds) {
                    data.user_ids = userIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                }
            }
            
            try {
                const response = await fetch('/api/admin/send-notification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                const messageDiv = document.getElementById('message');
                
                if (result.success) {
                    messageDiv.innerHTML = '<div class="alert alert-success">Notification sent successfully!</div>';
                    document.getElementById('notificationForm').reset();
                    toggleUserIds();
                } else {
                    messageDiv.innerHTML = '<div class="alert alert-error">Error: ' + (result.message || 'Failed to send notification') + '</div>';
                }
            } catch (error) {
                document.getElementById('message').innerHTML = '<div class="alert alert-error">Network error: ' + error.message + '</div>';
            }
        });
    </script>
</body>
</html>