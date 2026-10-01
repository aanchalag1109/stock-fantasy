<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\User;
use App\Models\Notification;
use App\Services\FCMService;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index()
    {
        $announcements = Announcement::latest()->get();
        return view('admin.announcements.index', compact('announcements'));
    }

    public function create()
    {
        $users = User::orderBy('name')->get();
        return view('admin.announcements.create', compact('users'));
    }

    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'type' => 'required|in:update,alert,promo',
            'send_to' => 'required|in:all,specific',
            'user_ids' => 'required_if:send_to,specific|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $announcement = Announcement::create([
            'title' => $request->title,
            'description' => $request->description,
            'type' => $request->type,
        ]);
        
        // Determine user IDs to send to
        if ($request->send_to === 'all') {
            $userIds = User::pluck('id')->toArray();
            $message = "Announcement created and sent to all users!";
        } else {
            $userIds = $request->user_ids;
            $message = "Announcement created and sent to " . count($userIds) . " users!";
        }
        
        // Save notifications to database
        $this->sendNotifications($announcement, $userIds);
        
        // Send FCM push notifications
        $fcmService = new FCMService();
        $fcmService->sendToSpecificUsers(
            $userIds,
            $announcement->title,
            $announcement->description,
            ['type' => 'announcement', 'announcement_id' => $announcement->id]
        );
        
        return redirect()->route('admin.announcements.index')->with('success', $message);
    }
    
    private function sendNotifications($announcement, $userIds)
    {
        foreach ($userIds as $userId) {
            Notification::create([
                'user_id' => $userId,
                'title' => $announcement->title,
                'description' => $announcement->description,
                'type' => $announcement->type,
            ]);
        }
        
        \Log::info('Notifications saved to database', [
            'announcement_id' => $announcement->id,
            'user_count' => count($userIds)
        ]);
    }
    
    private function sendPushNotifications($announcement, $userIds)
    {
        try {
            // Get FCM tokens for debugging
            $tokens = \DB::table('users')
                ->whereIn('id', $userIds)
                ->whereNotNull('fcm_token')
                ->pluck('fcm_token')
                ->toArray();
            
            \Log::info('FCM Debug Info', [
                'user_ids' => $userIds,
                'tokens_found' => count($tokens),
                'tokens' => $tokens,
                'fcm_server_key' => env('FCM_SERVER_KEY') ? 'SET' : 'NOT_SET'
            ]);
            
            $fcmService = new FCMService();
            $success = $fcmService->sendToSpecificUsers(
                $userIds,
                $announcement->title,
                $announcement->description,
                [
                    'type' => 'announcement',
                    'announcement_id' => $announcement->id,
                    'announcement_type' => $announcement->type,
                ]
            );
            
            if ($success) {
                \Log::info('Push notifications sent successfully', [
                    'announcement_id' => $announcement->id,
                    'user_count' => count($userIds),
                    'tokens_count' => count($tokens)
                ]);
            } else {
                \Log::error('Failed to send push notifications', [
                    'announcement_id' => $announcement->id,
                    'tokens_count' => count($tokens)
                ]);
            }
        } catch (\Exception $e) {
            \Log::error('Push notification error', [
                'error' => $e->getMessage(),
                'announcement_id' => $announcement->id,
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ]);
        }
    }

    public function show($id)
    {
        $announcement = Announcement::findOrFail($id);
        return view('admin.announcements.show', compact('announcement'));
    }

    public function edit($id)
    {
        $announcement = Announcement::findOrFail($id);
        return view('admin.announcements.edit', compact('announcement'));
    }

    public function update(Request $request, $id)
    {
        $announcement = Announcement::findOrFail($id);

        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'type' => 'required|in:update,alert,promo',
        ]);

        $announcement->update($request->all());
        return redirect()->route('admin.announcements.index')->with('success', 'Announcement updated successfully!');
    }

    public function destroy($id)
    {
        Announcement::destroy($id);
        return back()->with('success', 'Announcement deleted!');
    }

    public function bulkDelete(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'exists:announcements,id'
        ]);

        Announcement::whereIn('id', $request->ids)->delete();
        
        return response()->json([
            'success' => true,
            'message' => count($request->ids) . ' announcement(s) deleted successfully'
        ]);
    }
}