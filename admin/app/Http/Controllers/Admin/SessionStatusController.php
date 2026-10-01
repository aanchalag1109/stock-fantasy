<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\LeagueSession;

class SessionStatusController extends Controller
{
    public function startSession($sessionId)
    {
        try {
            $session = LeagueSession::findOrFail($sessionId);
            $session->status = 'live';
            $session->save();
            
            // Update all contests in this session
            \App\Models\Contest::where('league_session_id', $sessionId)
                ->update(['status' => 'live']);
            
            return response()->json(['success' => true, 'message' => 'Session started successfully']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
    
    public function endSession($sessionId)
    {
        try {
            $session = LeagueSession::findOrFail($sessionId);
            $session->status = 'completed';
            $session->save();
            
            // Update all contests in this session
            \App\Models\Contest::where('league_session_id', $sessionId)
                ->update(['status' => 'completed']);
            
            return response()->json(['success' => true, 'message' => 'Session ended successfully']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
