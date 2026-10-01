@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="page-title-box">
                <h4 class="page-title">Referral Management</h4>
            </div>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="row">
        <div class="col-md-3">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Total Referrals</h5>
                    <h3 class="text-primary">{{ $stats['total_referrals'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Active Referrers</h5>
                    <h3 class="text-success">{{ $stats['total_referrers'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Total Bonus Paid</h5>
                    <h3 class="text-warning">₹{{ number_format($stats['total_bonus_paid'], 2) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Deposits from Referrals</h5>
                    <h3 class="text-info">₹{{ number_format($stats['total_deposits_from_referrals'], 2) }}</h3>
                </div>
            </div>
        </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <ul class="nav nav-tabs">
                        <li class="nav-item">
                            <a class="nav-link active" href="{{ route('admin.referrals.index') }}">All Referrals</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ route('admin.referrals.transactions') }}">Transactions</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ route('admin.referrals.top-referrers') }}">Top Referrers</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ route('admin.referrals.settings') }}">Settings</a>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Referrer</th>
                                    <th>Referral Code</th>
                                    <th>Referred User</th>
                                    <th>Join Date</th>
                                    <th>Deposits</th>
                                    <th>Deposit Amount</th>
                                    <th>Bonus Earned</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($referrals as $referral)
                                <tr>
                                    <td>{{ $referral->referrer_name }}</td>
                                    <td><span class="badge badge-primary">{{ $referral->referral_code }}</span></td>
                                    <td>{{ $referral->referred_name }}</td>
                                    <td>{{ \Carbon\Carbon::parse($referral->joined_date)->format('d M Y') }}</td>
                                    <td>{{ $referral->total_deposits }}</td>
                                    <td>₹{{ number_format($referral->total_deposit_amount ?? 0, 2) }}</td>
                                    <td>₹{{ number_format($referral->total_bonus_earned ?? 0, 2) }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    {{ $referrals->links() }}
                </div>
            </div>
        </div>
    </div>
</div>
@endsection