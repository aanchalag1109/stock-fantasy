<?php
namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\KycSubmission;
use App\Models\User;

class KycSubmissionSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::inRandomOrder()->take(10)->get();
        $documentTypes = ['Aadhar', 'PAN', 'Passport', 'Driving License'];
        $statuses = ['pending', 'approved', 'rejected'];
        foreach ($users as $user) {
            KycSubmission::create([
                'user_id' => $user->id,
                'document_type' => $documentTypes[array_rand($documentTypes)],
                'document_number' => strtoupper(substr($user->name,0,2)) . rand(100000,999999),
                'front_image' => 'dummy/front_' . rand(1,10) . '.jpg',
                'back_image' => 'dummy/back_' . rand(1,10) . '.jpg',
                'selfie_image' => 'dummy/selfie_' . rand(1,10) . '.jpg',
                'status' => $statuses[array_rand($statuses)],
            ]);
        }
    }
}
