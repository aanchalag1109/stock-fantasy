@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="page-title-box">
                <h4 class="page-title">Top Referrers</h4>
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
                                    <th>Rank</th>
                                    <th>Referrer Name</th>
                                    <th>Referral Code</th>
                                    <th>Total Referrals</th>
                                    <th>Total Deposits Generated</th>
                                    <th>Total Earnings</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($topReferrers as $index => $referrer)
                                <tr>
                                    <td>
                                        <span class="badge badge-{{ $index < 3 ? 'warning' : 'secondary' }}">
                                            #{{ $index + 1 }}
                                        </span>
                                    </td>
                                    <td>{{ $referrer->name }}</td>
                                    <td><span class="badge badge-primary">{{ $referrer->referral_code }}</span></td>
                                    <td>{{ $referrer->total_referrals }}</td>
                                    <td>₹{{ number_format($referrer->total_deposits_generated ?? 0, 2) }}</td>
                                    <td>₹{{ number_format($referrer->total_earnings ?? 0, 2) }}</td>
                                    <td>
                                        <button class="btn btn-sm btn-info" onclick="viewDetails({{ $referrer->id }})">
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function viewDetails(userId) {
    // You can implement a modal or redirect to detailed view
    alert('View details for user ID: ' + userId);
}
</script>
@endsection