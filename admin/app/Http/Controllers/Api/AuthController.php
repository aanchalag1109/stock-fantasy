<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
public function login(Request $request)
{
    try {
        $request->validate([
            'mobile' => 'required|string|min:10|max:15',
            'fcm_token' => 'nullable|string',
        ]);

        $mobile = $request->input('mobile');
        $fcmToken = $request->input('fcm_token');

        $user = User::where('mobile', $mobile)->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'User not found. Please register first.'
            ], 404);
        }

        // Update FCM token if provided
        if ($fcmToken) {
            $user->fcm_token = $fcmToken;
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Login successful',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
            ],
            'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($user->id),
        ]);

    } catch (\Exception $e) {
        Log::error('Login failed: ' . $e->getMessage());

        return response()->json([
            'success' => false,
            'message' => 'Login failed'
        ], 500);
    }
}








 public function register(Request $request)
{
    try {
        $request->validate([
            'mobile' => 'required|string|min:10|max:15|unique:users,mobile',
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $mobile = $request->input('mobile');
        $existingUser = User::where('mobile', $mobile)->first();
        
        if ($existingUser) {
            return response()->json([
                'success' => false,
                'message' => 'User with this mobile number already exists.'
            ], 409);
        }
        
        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'mobile' => $mobile,
            'password' => Hash::make($request->input('password')),
            'deposit_balance' => 0,
            'winnings_balance' => 0,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);
        
        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
            ],
            'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($user->id),
        ]);
        
    } catch (\Exception $e) {
        Log::error('Registration failed: ' . $e->getMessage());
        return response()->json([
            'success' => false,
            'message' => 'Registration failed: ' . $e->getMessage(),
            'errors' => $e instanceof \Illuminate\Validation\ValidationException ? $e->errors() : null
        ], 400);
    }
}


   public function passwordLogin(Request $request)
    {
        try {
            $request->validate([
                'mobile' => 'required|string|min:10|max:15',
                'password' => 'required|string',
                'fcm_token' => 'nullable|string',
            ]);

            $mobile = $request->input('mobile');
            $password = $request->input('password');
            $fcmToken = $request->input('fcm_token');
            
            $user = User::where('mobile', $mobile)->first(); // Corrected: use User model
            
            if (!$user || !Hash::check($password, $user->password ?? '')) { // Corrected: use Hash facade, handle null password
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid mobile number or password'
                ], 401);
            }
            
            // Update FCM token if provided
            if ($fcmToken) {
                $user->fcm_token = $fcmToken;
                $user->save();
            }
            
            // Record signin log
            DB::table('user_signin_logs')->insert([ // Corrected: use DB facade
                'user_id' => $user->id,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'created_at' => Carbon::now(), // Corrected: use Carbon
                'updated_at' => Carbon::now(), // Corrected: use Carbon
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Login successful',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name ?: 'User',
                    'email' => $user->email ?: '',
                    'mobile' => $user->mobile ?: '',
                    'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
                    'age' => $user->age,
                    'gender' => $user->gender,
                ],
                'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($user->id),
            ]);
        } catch (\Exception $e) {
            Log::error('Password login failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Login failed: ' . $e->getMessage()
            ], 500);
        }
    }



public function checkUser(Request $request)
{
    try {
        $request->validate([
            'mobile' => 'required|string|min:10|max:20',
        ]);

        // Remove spaces & +
        $inputMobile = preg_replace('/\D/', '', $request->mobile);

        // Last 10 digits (India standard)
        $inputMobile = substr($inputMobile, -10);

        $user = User::whereRaw(
            "RIGHT(REPLACE(REPLACE(mobile, '+', ''), ' ', ''), 10) = ?",
            [$inputMobile]
        )->first();

        if ($user) {
            return response()->json([
                'exists' => true,
                'message' => 'User found. Please verify OTP.',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'mobile' => $user->mobile,
                ]
            ]);
        }

        return response()->json([
            'exists' => false,
            'message' => 'User not found. Please register first.'
        ], 404);

    } catch (\Exception $e) {
        Log::error('Check user error: ' . $e->getMessage());

        return response()->json([
            'success' => false,
            'message' => 'Something went wrong'
        ], 500);
    }
}


 public function getSettings(Request $request)
    {
        try {
            $settings = DB::table('settings')->pluck('value', 'key'); // Corrected: use DB facade
            return response()->json(['settings' => $settings]);
        } catch (\Exception $e) {
            Log::error('Error fetching settings: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch settings'], 500);
        }
    }





    public function getPaymentDetails(Request $request)
{
    try {
        $userId = $request->user_id;
        
        $paymentDetails = DB::table('user_payment_details')
            ->where('user_id', $userId)
            ->first();
        
        if (!$paymentDetails) {
            return response()->json([
                'status' => 'success',
                'data' => [
                    'usdt_wallet_address' => '',
                    'usdt_network'        => 'BEP20',
                ]
            ]);
        }
        
        return response()->json([
            'status' => 'success',
            'data' => [
                'usdt_wallet_address' => $paymentDetails->usdt_wallet_address ?? '',
                'usdt_network'        => 'BEP20', // Always BEP20
            ]
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => 'Failed to fetch payment details'
        ], 500);
    }
}

// Update user payment details
public function updatePaymentDetails(Request $request)
{
    try {
        $validator = Validator::make($request->all(), [
            'user_id'              => 'required|integer|exists:users,id',
            'usdt_wallet_address'  => 'nullable|string|max:255',
        ]);
        
        if ($validator->fails()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Validation failed',
                'errors'  => $validator->errors()
            ], 400);
        }
        
        $userId = $request->user_id;
        
        DB::table('user_payment_details')->updateOrInsert(
            ['user_id' => $userId],
            [
                'usdt_wallet_address' => $request->usdt_wallet_address,
                'usdt_network'        => 'BEP20', // Always BEP20
                'updated_at'          => now(),
                'created_at'          => now(),
            ]
        );
        
        return response()->json([
            'status'  => 'success',
            'message' => 'USDT wallet details updated successfully'
        ]);
        
    } catch (\Exception $e) {
        Log::error('Payment details update failed: ' . $e->getMessage());
        return response()->json([
            'status'  => 'error',
            'message' => 'Failed to update payment details'
        ], 500);
    }
}

 public function updateProfile(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|integer|exists:users,id',
                'name' => 'required|string|max:255',
                'email' => 'required|email|max:255|unique:users,email,' . $request->input('user_id'),
                'mobile' => 'required|string|max:15|unique:users,mobile,' . $request->input('user_id'),
                'password' => 'nullable|string|min:6',
                'profile_image' => 'nullable|image|mimes:jpeg,jpg,png|max:2048',
            ]);

            $user = User::find($request->input('user_id'));
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $user->name = $request->input('name');
            $user->email = $request->input('email');
            $user->mobile = $request->input('mobile');
            
            if ($request->filled('password')) {
                $user->password = Hash::make($request->input('password'));
            }
            
            // Handle profile image upload
            if ($request->hasFile('profile_image')) {
                $image = $request->file('profile_image');
                $imageName = 'profile_' . $user->id . '_' . time() . '.' . $image->getClientOriginalExtension();
                $image->move(public_path('uploads/profiles'), $imageName);
                $user->profile_image = 'uploads/profiles/' . $imageName;
            }
            
            $user->save();

            return response()->json([
                'success' => true,
                'message' => 'Profile updated successfully',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'mobile' => $user->mobile,
                    'profile_image' => $user->profile_image ? url($user->profile_image) : null,
                    'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Profile update failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Profile update failed: ' . $e->getMessage(),
                'errors' => $e instanceof \Illuminate\Validation\ValidationException ? $e->errors() : null
            ], 500);
        }
    }

    public function getUserProfile(Request $request)
    {
        try {
            $userId = $request->query('user_id');
            if (!$userId) {
                return response()->json([
                    'success' => false,
                    'message' => 'User ID is required'
                ], 400);
            }

            $user = User::find($userId); // Corrected: use User model
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            return response()->json([
                'success' => true,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'mobile' => $user->mobile,
                    'profile_image' => $user->profile_image ? url($user->profile_image) : null,
                    'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
                    'age' => $user->age,
                    'gender' => $user->gender,
                ],
                'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($userId),
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch user profile: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch user profile: ' . $e->getMessage()
            ], 500);
        }
    }

}