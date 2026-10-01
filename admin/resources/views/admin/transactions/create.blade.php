@extends('admin.layouts.app')

@section('content')

<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0">Create Transaction</h4>
                </div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.transactions.store') }}">
                        @csrf

                        <div class="mb-3">
                            <label for="user_id" class="form-label">User</label>
                            <select class="form-select" id="user_id" name="user_id" required>
                                @foreach($users as $user)
                                    <option value="{{ $user->id }}">{{ $user->name }} ({{ $user->email }})</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="type" class="form-label">Type</label>
                            <select class="form-select" id="type" name="type" required>
                                <option value="deposit">Deposit</option>
                                <option value="withdrawal">Withdrawal</option>
                                <option value="contest_entry">Contest Entry</option>
                                <option value="winnings">Winnings</option>
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="amount" class="form-label">Amount</label>
                            <input type="number" step="0.01" class="form-control" id="amount" name="amount" required>
                        </div>

                        <div class="mb-3">
                            <label for="status" class="form-label">Status</label>
                            <select class="form-select" id="status" name="status" required>
                                <option value="pending">Pending</option>
                                <option value="success">Success</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="payment_method" class="form-label">Payment Method <span class="text-muted">(optional)</span></label>
                            <input type="text" class="form-control" id="payment_method" name="payment_method">
                        </div>

                        <div class="mb-3">
                            <label for="transaction_id" class="form-label">Transaction ID <span class="text-muted">(optional)</span></label>
                            <input type="text" class="form-control" id="transaction_id" name="transaction_id">
                        </div>

                        <div class="mb-3">
                            <label for="description" class="form-label">Description <span class="text-muted">(optional)</span></label>
                            <textarea class="form-control" id="description" name="description" rows="3" placeholder="Enter transaction description"></textarea>
                        </div>

                        <button type="submit" class="btn btn-success w-100 py-2">Create Transaction</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection