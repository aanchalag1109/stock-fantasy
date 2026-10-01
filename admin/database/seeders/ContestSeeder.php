<?php

namespace Database\Seeders;

use App\Models\Contest;
use App\Models\Portfolio;
use App\Models\Entry;
use App\Models\Transaction;
use App\Models\KycSubmission;
use App\Models\Leaderboard;
use App\Models\Ticket;
use App\Models\TicketReply;
use App\Models\Announcement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ContestSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create contests
        $contests = [
            [
                'name' => 'Summer Trading Challenge 2023',
                'type' => 'stock',
                'start_time' => now()->subDays(15),
                'end_time' => now()->addDays(15),
                'prize_pool' => 10000,
                'max_participants' => 100,
                'entry_fee' => 100,
                'status' => 'live',
            ],
            [
                'name' => 'Crypto Masters Tournament',
                'type' => 'crypto',
                'start_time' => now()->addDays(5),
                'end_time' => now()->addDays(35),
                'prize_pool' => 25000,
                'max_participants' => 200,
                'entry_fee' => 250,
                'status' => 'upcoming',
            ],
            [
                'name' => 'Options Trading Showdown',
                'type' => 'stock',
                'start_time' => now()->subDays(30),
                'end_time' => now()->subDays(5),
                'prize_pool' => 5000,
                'max_participants' => 50,
                'entry_fee' => 50,
                'status' => 'completed',
            ],
        ];

        foreach ($contests as $contestData) {
            $contest = Contest::create($contestData);
            
            // Create portfolios for this contest
            $this->createPortfolios($contest);
        }

        // Create KYC submissions
        $this->createKycSubmissions();
        
        // Create tickets and replies
        $this->createTickets();
        
        // Create announcements
        $this->createAnnouncements();
    }
    
    private function createPortfolios(Contest $contest)
    {
        $users = User::inRandomOrder()->take(rand(10, 30))->get();
        
        foreach ($users as $user) {
            $initialBalance = 10000;
            $currentBalance = rand(8000, 15000);
            $totalScore = $currentBalance - $initialBalance;
            
            $portfolio = Portfolio::create([
                'user_id' => $user->id,
                'contest_id' => $contest->id,
                'total_score' => $totalScore,
                'rank' => null, // Will be set later
                'winnings' => $contest->status === 'completed' ? rand(0, $contest->prize_pool / 10) : 0,
            ]);
            
            // Initial and current balance are not stored in the database
            // as they're not part of the schema
            
            // Create entries for this portfolio
            $this->createEntries($portfolio, $contest);
            
            // Create transactions for this portfolio
            $this->createTransactions($portfolio, $contest);
            
            // Create leaderboard entry
            if ($contest->status !== 'upcoming') {
                Leaderboard::create([
                    'contest_id' => $contest->id,
                    'user_id' => $user->id,
                    'score' => $totalScore,
                    'rank' => 0, // Will be updated after all entries are created
                ]);
            }
        }
        
        // Update ranks for this contest
        if ($contest->status !== 'upcoming') {
            $this->updateLeaderboardRanks($contest->id);
        }
    }
    
    private function createEntries(Portfolio $portfolio, Contest $contest)
    {
        $entryCount = rand(5, 20);
        $symbols = $contest->type === 'crypto' 
            ? ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'SOL', 'DOGE', 'AVAX', 'LINK']
            : ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT'];
        
        for ($i = 0; $i < $entryCount; $i++) {
            $buyPrice = $contest->type === 'crypto' 
                ? rand(10, 100000) + (rand(0, 99) / 100)
                : rand(10, 1000) + (rand(0, 99) / 100);
                
            $currentPrice = $buyPrice * (0.8 + (rand(0, 40) / 100)); // Random price between 80% and 120% of buy price
            $percentageChange = (($currentPrice - $buyPrice) / $buyPrice) * 100;
            
            Entry::create([
                'portfolio_id' => $portfolio->id,
                'symbol' => $symbols[array_rand($symbols)],
                'buy_price' => $buyPrice,
                'current_price' => $currentPrice,
                'percentage_change' => $percentageChange,
                'score' => $percentageChange * (rand(80, 120) / 100), // Random score based on percentage change
            ]);
        }
    }
    
    private function createTransactions(Portfolio $portfolio, Contest $contest)
    {
        $transactionTypes = ['deposit', 'withdrawal', 'contest_entry', 'winnings'];
        $paymentMethods = ['razorpay', 'upi', 'bank_transfer', 'credit_card'];
        $count = rand(5, 15);
        
        for ($i = 0; $i < $count; $i++) {
            $type = $transactionTypes[array_rand($transactionTypes)];
            $amount = 0;
            $status = 'success'; // Most transactions are successful by default
            
            // Set appropriate amounts based on transaction type
            switch ($type) {
                case 'deposit':
                    $amount = rand(1000, 10000) + (rand(0, 99) / 100);
                    break;
                case 'withdrawal':
                    $amount = rand(100, 5000) + (rand(0, 99) / 100);
                    // 20% chance of pending or failed status for withdrawals
                    $status = rand(0, 4) === 0 ? (rand(0, 1) ? 'pending' : 'failed') : 'success';
                    break;
                case 'contest_entry':
                    $amount = $contest->entry_fee;
                    break;
                case 'winnings':
                    $amount = $portfolio->winnings;
                    break;
            }
            
            // Only create winnings transaction if there are actual winnings
            if ($type === 'winnings' && $amount <= 0) {
                continue;
            }
            
            Transaction::create([
                'user_id' => $portfolio->user_id,
                'type' => $type,
                'amount' => $amount,
                'status' => $status,
                'payment_method' => in_array($type, ['deposit', 'withdrawal']) ? $paymentMethods[array_rand($paymentMethods)] : null,
                'transaction_id' => 'TXN' . strtoupper(Str::random(10)),
                'created_at' => $contest->start_time->copy()->addDays(rand(0, $contest->start_time->diffInDays($contest->end_time))),
            ]);
        }
    }
    
    private function createKycSubmissions()
    {
        $users = User::inRandomOrder()->take(15)->get();
        $statuses = ['pending', 'approved', 'rejected'];
        $rejectionReasons = ['Blurry document', 'Expired ID', 'Mismatched information', 'Suspicious activity', 'Incomplete documentation'];
        $documentTypes = ['passport', 'driving_license', 'national_id', 'residence_permit'];
        
        foreach ($users as $user) {
            $status = $statuses[array_rand($statuses)];
            $submission = [
                'user_id' => $user->id,
                'document_type' => $documentTypes[array_rand($documentTypes)],
                'document_number' => strtoupper(Str::random(2)) . rand(100000, 999999),
                'first_name' => $user->name,
                'last_name' => 'User',
                'date_of_birth' => now()->subYears(rand(18, 70))->subMonths(rand(0, 11))->subDays(rand(0, 30)),
                'address' => rand(100, 9999) . ' Main St, City, Country',
                'city' => 'City ' . rand(1, 100),
                'country' => 'Country ' . rand(1, 20),
                'postal_code' => strtoupper(Str::random(1)) . rand(10000, 99999),
                'status' => $status,
                'reviewed_by' => 1, // Admin user
                'reviewed_at' => now(),
                'rejection_reason' => $status === 'rejected' ? $rejectionReasons[array_rand($rejectionReasons)] : null,
                'document_front' => 'documents/' . Str::random(40) . '.jpg',
                'document_back' => 'documents/' . Str::random(40) . '.jpg',
                'selfie' => 'documents/' . Str::random(40) . '.jpg',
                'metadata' => json_encode(['ip' => '192.168.' . rand(1, 255) . '.' . rand(1, 255)]),
            ];
            
            KycSubmission::create($submission);
        }
    }
    
    private function createTickets()
    {
        $users = User::inRandomOrder()->take(20)->get();
        $statuses = ['open', 'in_progress', 'resolved', 'closed'];
        $priorities = ['low', 'medium', 'high', 'critical'];
        $categories = ['account', 'technical', 'billing', 'withdrawal', 'other'];
        
        foreach ($users as $user) {
            $ticket = Ticket::create([
                'user_id' => $user->id,
                'subject' => 'Help with ' . $categories[array_rand($categories)] . ' issue',
                'description' => 'I am having an issue with ' . ['login', 'withdrawal', 'deposit', 'contest entry', 'account verification'][array_rand([0, 1, 2, 3, 4])] . '. Please help me resolve this as soon as possible.',
                'status' => $statuses[array_rand($statuses)],
                'priority' => $priorities[array_rand($priorities)],
                'category' => $categories[array_rand($categories)],
                'assigned_to' => rand(0, 1) ? 1 : null, // Assign to admin or leave unassigned
                'created_at' => now()->subDays(rand(0, 30)),
                'updated_at' => now(),
            ]);
            
            // Add 1-5 replies to each ticket
            $replyCount = rand(1, 5);
            for ($i = 0; $i < $replyCount; $i++) {
                $isAdmin = $i % 2 === 0; // Alternate between user and admin replies
                
                TicketReply::create([
                    'ticket_id' => $ticket->id,
                    'user_id' => $isAdmin ? 1 : $user->id,
                    'message' => $isAdmin 
                        ? 'Thank you for contacting support. ' . ['We are looking into your issue.', 'Please provide more details about your problem.', 'This issue has been escalated to our technical team.'][array_rand([0, 1, 2])]
                        : ['Any updates on my ticket?', 'The issue is still persisting.', 'Thank you for your help!', 'Can you provide an ETA for resolution?'][array_rand([0, 1, 2, 3])],
                    'created_at' => $ticket->created_at->copy()->addHours($i + 1),
                ]);
                
                // Update ticket status based on replies
                if ($i === $replyCount - 1 && $ticket->status !== 'closed') {
                    $ticket->update([
                        'status' => $isAdmin ? 'waiting_customer' : 'in_progress',
                        'updated_at' => $ticket->created_at->copy()->addHours($i + 1),
                    ]);
                }
            }
            
            // Randomly close some tickets
            if (rand(0, 1) && $ticket->status !== 'closed') {
                $ticket->update([
                    'status' => 'closed',
                    'updated_at' => $ticket->created_at->copy()->addDays(rand(1, 5)),
                ]);
            }
        }
    }
    
    private function createAnnouncements()
    {
        // Get the current time as a Carbon instance
        $now = now();
        
        $announcements = [
            [
                'title' => 'New Trading Competition Starting Soon!',
                'content' => 'Get ready for our biggest trading competition of the year with over $50,000 in prizes!',
                'type' => 'promo',
                'start_date' => $now->copy(),
                'end_date' => $now->copy()->addDays(30),
                'is_pinned' => true,
            ],
            [
                'title' => 'Scheduled Maintenance',
                'content' => 'We will be performing scheduled maintenance on our platform on ' . $now->copy()->addDays(2)->format('F j, Y') . ' from 2:00 AM to 5:00 AM UTC.',
                'type' => 'alert',
                'start_date' => $now->copy(),
                'end_date' => $now->copy()->addDays(3),
                'is_pinned' => false,
            ],
            [
                'title' => 'New Feature: Social Trading',
                'content' => 'We are excited to announce our new social trading feature! Now you can follow and copy the trades of top performers.',
                'type' => 'update',
                'start_date' => $now->copy()->subDays(5),
                'end_date' => $now->copy()->addDays(25),
                'is_pinned' => true,
            ],
            [
                'title' => 'Important KYC Update',
                'content' => 'Due to regulatory requirements, all users must complete KYC verification before making withdrawals.',
                'type' => 'alert',
                'start_date' => $now->copy()->subDays(10),
                'end_date' => $now->copy()->addDays(20),
                'is_pinned' => true,
            ],
            [
                'title' => 'Weekly Market Update',
                'content' => 'Stay updated with the latest market trends and analysis in our weekly newsletter.',
                'type' => 'update',
                'start_date' => $now->copy()->subDays(2),
                'end_date' => $now->copy()->addDays(5),
                'is_pinned' => false,
            ],
        ];
        
        foreach ($announcements as $announcement) {
            Announcement::create($announcement);
        }
    }
    
    private function updateLeaderboardRanks($contestId)
    {
        // Get all entries for this contest ordered by score (descending)
        $leaderboardEntries = Leaderboard::where('contest_id', $contestId)
            ->orderBy('score', 'desc')
            ->get();
        
        $rank = 1;
        $previousScore = null;
        $sameScoreCount = 0;
        
        foreach ($leaderboardEntries as $entry) {
            if ($previousScore !== null && $entry->score === $previousScore) {
                // Same score as previous entry, same rank
                $sameScoreCount++;
            } else {
                // New score, update rank
                $rank += $sameScoreCount;
                $sameScoreCount = 1;
            }
            
            $entry->update(['rank' => $rank]);
            $previousScore = $entry->score;
        }
    }
}
