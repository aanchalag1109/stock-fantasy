<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FCMService
{
    private $serviceAccountPath;
    private $fcmUrl = 'https://fcm.googleapis.com/v1/projects/probtrade-5a81a/messages:send';

    public function __construct()
    {
        $this->serviceAccountPath = public_path('probtrade-5a81a-d7f1b078147f.json');
    }

    private function getAccessToken()
    {
        $serviceAccount = json_decode(file_get_contents($this->serviceAccountPath), true);
        
        $header = json_encode(['typ' => 'JWT', 'alg' => 'RS256']);
        $payload = json_encode([
            'iss' => $serviceAccount['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => time(),
            'exp' => time() + 3600
        ]);
        
        $base64Header = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64Payload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        
        $signature = '';
        openssl_sign($base64Header . '.' . $base64Payload, $signature, $serviceAccount['private_key'], OPENSSL_ALGO_SHA256);
        $base64Signature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        
        $jwt = $base64Header . '.' . $base64Payload . '.' . $base64Signature;
        
        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt
        ]);
        
        if ($response->successful()) {
            return $response->json()['access_token'];
        }
        
        throw new \Exception('Failed to get access token');
    }

    public function sendNotification($tokens, $title, $body, $data = [])
    {
        if (empty($tokens)) {
            return false;
        }

        if (!is_array($tokens)) {
            $tokens = [$tokens];
        }

        $tokens = array_filter($tokens);
        
        if (empty($tokens)) {
            return false;
        }

        try {
            $accessToken = $this->getAccessToken();
            Log::info('FCM Access Token obtained', ['token_length' => strlen($accessToken)]);
            $successCount = 0;
            
            foreach ($tokens as $token) {
                $message = [
                    'token' => $token,
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                    ]
                ];
                
                if (!empty($data)) {
                    $message['data'] = array_map('strval', $data);
                }
                
                $payload = ['message' => $message];

                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                    'Content-Type' => 'application/json',
                ])->post($this->fcmUrl, $payload);

                if ($response->successful()) {
                    $successCount++;
                    Log::info('FCM individual success', ['token' => substr($token, 0, 20) . '...']);
                } else {
                    $responseBody = $response->json();
                    $errorCode = $responseBody['error']['details'][0]['errorCode'] ?? null;
                    
                    // Remove invalid/unregistered tokens from database
                    if ($errorCode === 'UNREGISTERED' || $response->status() === 404) {
                        \DB::table('users')->where('fcm_token', $token)->update(['fcm_token' => null]);
                        Log::info('Removed invalid FCM token', ['token' => substr($token, 0, 20) . '...']);
                    } else {
                        Log::error('FCM individual failed', [
                            'token' => substr($token, 0, 20) . '...',
                            'status' => $response->status(),
                            'response' => $response->body()
                        ]);
                    }
                }
            }
            
            Log::info('FCM notification sent', [
                'success_count' => $successCount,
                'total_tokens' => count($tokens),
            ]);
            
            return $successCount > 0;
            
        } catch (\Exception $e) {
            Log::error('FCM notification exception', [
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    public function sendToAllUsers($title, $body, $data = [])
    {
        $tokens = \DB::table('users')
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        return $this->sendNotification($tokens, $title, $body, $data);
    }

    public function sendToSpecificUsers($userIds, $title, $body, $data = [])
    {
        $tokens = \DB::table('users')
            ->whereIn('id', $userIds)
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        return $this->sendNotification($tokens, $title, $body, $data);
    }
}