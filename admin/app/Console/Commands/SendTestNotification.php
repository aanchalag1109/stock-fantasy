<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\FCMService;

class SendTestNotification extends Command
{
    protected $signature = 'notification:test {--title=Test} {--message=This is a test notification}';
    protected $description = 'Send a test notification to all users';

    public function handle()
    {
        $fcmService = new FCMService();
        
        $title = $this->option('title');
        $message = $this->option('message');
        
        $this->info("Sending notification: {$title}");
        
        $result = $fcmService->sendToAllUsers($title, $message, [
            'type' => 'test',
            'timestamp' => time()
        ]);
        
        if ($result) {
            $this->info('✅ Notification sent successfully!');
        } else {
            $this->error('❌ Failed to send notification');
        }
    }
}