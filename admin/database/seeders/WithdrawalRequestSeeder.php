<?php
namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\WithdrawalRequest;
use App\Models\User;

class WithdrawalRequestSeeder extends Seeder
{
    public function run()
    {
        $user = User::first();
        if (!$user) {
            $user = User::factory()->create();
        }
        WithdrawalRequest::create([
            'user_id' => $user->id,
            'amount' => 1000,
            'status' => 'pending',
            'admin_message' => null,
        ]);
        WithdrawalRequest::create([
            'user_id' => $user->id,
            'amount' => 500,
            'status' => 'accepted',
            'admin_message' => 'Approved by admin.',
        ]);
        WithdrawalRequest::create([
            'user_id' => $user->id,
            'amount' => 250,
            'status' => 'rejected',
            'admin_message' => 'Insufficient balance.',
        ]);
    }
}
