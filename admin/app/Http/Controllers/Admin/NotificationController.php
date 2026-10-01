<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\FCMService;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class NotificationController extends Controller
{
    protected $fcmService;

    public function __construct(FCMService $fcmService)
    {
        $this->fcmService = $fcmService;
    }

    public function sendNotification(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'type' => 'in:all,specific',
            'user_ids' => 'required_if:type,specific|array',
            'user_ids.*' => 'integer|exists:users,id'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        $title = $request->title;
        $message = $request->message;
        $type = $request->type ?? 'all';
        $data = $request->data ?? [];

        try {
            if ($type === 'all') {
                // Send to all users
                $result = $this->fcmService->sendToAllUsers($title, $message, $data);
                
                // Save notification to database
                Notification::create([
                    'title' => $title,
                    'message' => $message,
                    'type' => 'broadcast',
                    'data' => json_encode($data),
                    'sent_at' => now()
                ]);
                
            } else {
                // Send to specific users
                $userIds = $request->user_ids;
                $result = $this->fcmService->sendToSpecificUsers($userIds, $title, $message, $data);
                
                // Save notifications for each user
                foreach ($userIds as $userId) {
                    Notification::create([
                        'user_id' => $userId,
                        'title' => $title,
                        'message' => $message,
                        'type' => 'personal',
                        'data' => json_encode($data),
                        'sent_at' => now()
                    ]);
                }
            }

            if ($result) {
                return response()->json([
                    'success' => true,
                    'message' => 'Notification sent successfully'
                ]);
            } else {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to send notification'
                ], 500);
            }

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error sending notification: ' . $e->getMessage()
            ], 500);
        }
    }
}