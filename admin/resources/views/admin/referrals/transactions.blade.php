@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="page-title-box">
                <h4 class="page-title">Referral Transactions</h4>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Referrer</th>
                                    <th>Referral Code</th>
                                    <th>Referred User</th>
                                    <th>Deposit #</th>
                                    <th>Deposit Amount</th>
                                    <th>Bonus Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($transactions as $transaction)
                                <tr>
                                    <td>{{ \Carbon\Carbon::parse($transaction->created_at)->format('d M Y H:i') }}</td>
                                    <td>{{ $transaction->referrer_name }}</td>
                                    <td><span class="badge badge-primary">{{ $transaction->referral_code }}</span></td>
                                    <td>{{ $transaction->referred_name }}</td>
                                    <td>
                                        <span class="badge badge-{{ $transaction->deposit_count == 1 ? 'success' : 'info' }}">
                                            #{{ $transaction->deposit_count }}
                                        </span>
                                    </td>
                                    <td>₹{{ number_format($transaction->deposit_amount, 2) }}</td>
                                    <td>₹{{ number_format($transaction->bonus_amount, 2) }}</td>
                                    <td><span class="badge badge-success">Paid</span></td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    {{ $transactions->links() }}
                </div>
            </div>
        </div>
    </div>
</div>
@endsection