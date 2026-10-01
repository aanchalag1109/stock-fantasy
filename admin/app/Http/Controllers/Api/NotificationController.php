<?php

namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;

use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public static function getUnreadCount($userId = null)
    {
        if (!$userId) return 0;
        
        return Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->count();
    }

    public function getUserNotifications(Request $request)
    {
        $userId = $request->input('user_id') ?? $request->query('user_id');
        
        if (!$userId) {
            // No user_id = return empty (don't show everyone's notifications)
            return response()->json([
                'success' => true,
                'notifications' => []
            ]);
        }

        // Fetch only notifications that belong to THIS user
        $notifications = Notification::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function($notification) {
                return [
                    'id' => $notification->id,
                    'title' => $notification->title,
                    'description' => $notification->description,
                    'type' => $notification->type,
                    'created_at' => $notification->created_at,
                    'is_read' => (bool) $notification->is_read
                ];
            });

        return response()->json([
            'success' => true,
            'notifications' => $notifications
        ]);
    }

    public function markAsRead(Request $request)
    {
        $notificationId = $request->input('notification_id');
        
        if (!$notificationId) {
            return response()->json([
                'success' => false,
                'message' => 'Notification ID is required'
            ], 400);
        }

        $notification = Notification::find($notificationId);
        
        if (!$notification) {
            return response()->json([
                'success' => false,
                'message' => 'Notification not found'
            ], 404);
        }

        $notification->update(['is_read' => true]);

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read'
        ]);
    }

    public function markAllAsRead(Request $request)
    {
        $userId = $request->input('user_id');
        
        if (!$userId) {
            return response()->json([
                'success' => false,
                'message' => 'User ID is required'
            ], 400);
        }

        Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json([
            'success' => true,
            'message' => 'All notifications marked as read'
        ]);
    }
}