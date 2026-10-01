<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request) {
        $query = User::query()->where('is_test_user', 0);

        // Search by name or email
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('mobile', 'like', "%{$search}%");
            });
        }

        // Filter by KYC status
        if ($request->has('kyc_status') && in_array($request->kyc_status, ['pending', 'verified', 'rejected'])) {
            $query->where('kyc_status', $request->kyc_status);
        }

        

        // Order by latest first and paginate users
        $users = $query->latest()->paginate(20);

        // Debug: Log the users data count
        \Log::info('Users fetched for admin.users.index:', ['count' => $users->count()]);

        return view('admin.users.index', compact('users'));
    }

    public function create() {
        return view('admin.users.create');
    }

    public function store(Request $request) {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'mobile' => 'required|string|min:10|max:15',
            'country_code' => 'required|string',
            'password' => 'required|string|min:8',
            'is_admin' => 'boolean',
        ]);
        
        // Check if mobile number already exists
        $fullMobile = $request->country_code . $request->mobile;
        $existingUser = User::where('mobile', $fullMobile)->first();
        
        if ($existingUser) {
            return back()->withErrors(['mobile' => 'This mobile number is already registered.'])->withInput();
        }

        User::create([
            'name' => $request->name,
            'email' => $request->email,
            'mobile' => $fullMobile,
            'password' => Hash::make($request->password),
            'is_admin' => $request->has('is_admin'),
        ]);

        return redirect()->route('admin.users.index')->with('success', 'User created successfully!');
    }

    public function show($id) {
        return view('admin.users.show', ['user' => User::findOrFail($id)]);
    }

    public function edit($id) {
        $user = User::findOrFail($id);
        return view('admin.users.edit', compact('user'));
    }

    public function update(Request $request, $id) {
        $user = User::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email,' . $id,
            'mobile' => 'nullable|string',
            'password' => 'nullable|string|min:8',
            'deposit_balance' => 'numeric',
            'winnings_balance' => 'numeric',
            'is_admin' => 'boolean',
        ]);

        $user->name = $request->name;
        $user->email = $request->email;
        
        if ($request->filled('mobile')) {
            $user->mobile = $request->mobile;
        }
        
        $user->deposit_balance = $request->deposit_balance ?? 0;
        $user->winnings_balance = $request->winnings_balance ?? 0;
        $user->is_admin = $request->has('is_admin');

        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }

        $user->save();

        return redirect()->route('admin.users.index')->with('success', 'User updated successfully!');
    }

    public function destroy($id) {
        User::destroy($id);
        return back()->with('success', 'User deleted');
    }

    public function bulkDelete(Request $request) {
        $userIds = json_decode($request->user_ids, true);
        
        if (!is_array($userIds) || empty($userIds)) {
            return back()->with('error', 'No users selected for deletion');
        }

        $request->validate([
            'user_ids' => 'required|string'
        ]);

        // Validate that all IDs exist
        $validIds = User::whereIn('id', $userIds)->pluck('id')->toArray();
        
        if (empty($validIds)) {
            return back()->with('error', 'No valid users found for deletion');
        }

        $deletedCount = User::whereIn('id', $validIds)->delete();
        
        return back()->with('success', "Successfully deleted {$deletedCount} user(s)");
    }

    public function impersonate($id)
    {
        $user = User::findOrFail($id);
        // Store the admin's ID in session to allow reverting
        session(['impersonate_admin_id' => auth()->id()]);
        auth()->login($user);
        return redirect('/')->with('success', 'You are now impersonating user: ' . $user->name);
    }

    public function addToWallet(Request $request, User $user)
    {
        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'nullable|string|max:255'
        ]);

        $user->wallet_balance = ($user->wallet_balance ?? 0) + $request->amount;
        $user->save();

        return redirect()->route('admin.users.index')->with('success', 
            "Added {$request->amount} probcoins to {$user->name}'s wallet");
    }

    public function removeFromWallet(Request $request, User $user)
    {
        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'nullable|string|max:255'
        ]);

        $currentBalance = $user->wallet_balance ?? 0;
        
        if ($request->amount > $currentBalance) {
            return redirect()->route('admin.users.index')->with('error', 
                "Cannot remove {$request->amount} probcoins. User only has {$currentBalance} probcoins");
        }

        $user->wallet_balance = $currentBalance - $request->amount;
        $user->save();

        return redirect()->route('admin.users.index')->with('success', 
            "Removed {$request->amount} probcoins from {$user->name}'s wallet");
    }
}