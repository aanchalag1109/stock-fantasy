@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="page-title-box">
                <h4 class="page-title">Referral Settings</h4>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-md-8">
            <div class="card">
                <div class="card-header">
                    <h5>Referral Configuration</h5>
                </div>
                <div class="card-body">
                    <form action="{{ route('admin.referrals.settings.update') }}" method="POST">
                        @csrf
                        <div class="form-group">
                            <label>First Deposit Bonus (%)</label>
                            <input type="number" name="referral_first_deposit_bonus" class="form-control" 
                                   value="{{ $settings['referral_first_deposit_bonus'] ?? 8 }}" min="0" max="100">
                            <small class="text-muted">Bonus percentage for referrer on first deposit</small>
                        </div>

                        <div class="form-group">
                            <label>Subsequent Deposits Bonus (%)</label>
                            <input type="number" name="referral_bonus_percentage" class="form-control" 
                                   value="{{ $settings['referral_bonus_percentage'] ?? 3 }}" min="0" max="100">
                            <small class="text-muted">Bonus percentage for referrer on deposits 2-10</small>
                        </div>

                        <div class="form-group">
                            <label>Maximum Deposits per Referral</label>
                            <input type="number" name="referral_max_deposits" class="form-control" 
                                   value="{{ $settings['referral_max_deposits'] ?? 10 }}" min="1" max="50">
                            <small class="text-muted">Maximum number of deposits that earn referral bonus</small>
                        </div>

                        <button type="submit" class="btn btn-primary">Update Settings</button>
                    </form>
                </div>
            </div>
        </div>

        <div class="col-md-4">
            <div class="card">
                <div class="card-header">
                    <h5>How Referral System Works</h5>
                </div>
                <div class="card-body">
                    <ul class="list-unstyled">
                        <li><i class="fas fa-check text-success"></i> User gets unique referral code on registration</li>
                        <li><i class="fas fa-check text-success"></i> When referred user makes first deposit, referrer gets {{ $settings['referral_first_deposit_bonus'] ?? 8 }}% bonus</li>
                        <li><i class="fas fa-check text-success"></i> For deposits 2-10, referrer gets {{ $settings['referral_bonus_percentage'] ?? 3 }}% bonus</li>
                        <li><i class="fas fa-check text-success"></i> Maximum {{ $settings['referral_max_deposits'] ?? 10 }} deposits per referral</li>
                        <li><i class="fas fa-check text-success"></i> Bonuses are added to referrer's wallet</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection