@extends('admin.layouts.app')

@section('content')
<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0">Entry Details: #{{ $entry->id }}</h4>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <p class="mb-2"><strong>User:</strong> {{ $entry->portfolio->user->name }}</p>
                            <p class="mb-2"><strong>Contest:</strong> {{ $entry->portfolio->contest->name }}</p>
                            <p class="mb-2"><strong>Entry Time:</strong> {{ $entry->created_at }}</p>
                        </div>
                        <div class="col-md-6">
                            <p class="mb-2"><strong>Score:</strong> {{ number_format($entry->score, 2) }}</p>
                            <p class="mb-2"><strong>Status:</strong>
                                @if($entry->score > 0)
                                    <span class="badge bg-success">Won</span>
                                @elseif($entry->score < 0)
                                    <span class="badge bg-danger">Lost</span>
                                @else
                                    <span class="badge bg-secondary">Neutral</span>
                                @endif
                            </p>
                        </div>
                    </div>
                    <h5 class="mb-3">Asset Details</h5>
                    <div class="table-responsive">
                        <table class="table table-bordered align-middle">
                            <thead class="table-light">
                                <tr>
                                    <th>Symbol</th>
                                    <th>Buy Price</th>
                                    <th>Current Price</th>
                                    <th>Percentage Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{{ $entry->symbol }}</td>
                                    <td>{{ $entry->buy_price }}</td>
                                    <td>{{ $entry->current_price ?? 'N/A' }}</td>
                                    <td>{{ isset($entry->percentage_change) ? number_format($entry->percentage_change, 2) : 'N/A' }}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <a href="{{ route('admin.entries.index') }}" class="btn btn-secondary w-100">Back to Entries List</a>
        </div>
    </div>
</div>
@endsection