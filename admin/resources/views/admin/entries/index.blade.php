@extends('admin.layouts.app')

@section('content')
<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-11">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0 fw-bold text-white">Entries</h4>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Entry ID</th>
                                    <th>User</th>
                                    <th>Contest</th>
                                    <th>Entry Time</th>
                                    <th>Score</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($entries as $entry)
                                <tr>
                                    <td>{{ $entry->id }}</td>
                                    <td>{{ $entry->portfolio->user->name }}</td>
                                    <td>{{ $entry->portfolio->contest->name }}</td>
                                    <td>{{ $entry->created_at }}</td>
                                    <td>{{ number_format($entry->score, 2) }}</td>
                                    <td>
                                        @if($entry->score > 0)
                                            <span class="badge bg-success">Won</span>
                                        @elseif($entry->score < 0)
                                            <span class="badge bg-danger">Lost</span>
                                        @else
                                            <span class="badge bg-secondary">Neutral</span>
                                        @endif
                                    </td>
                                    <td>
                                        <a href="{{ route('admin.entries.show', $entry->id) }}" class="btn btn-sm btn-info">View Details</a>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    @if(method_exists($entries, 'links'))
                    <div class="card-footer bg-white py-3">
                        <nav>
                            {!! $entries->withQueryString()->links('pagination::bootstrap-5') !!}
                        </nav>
                    </div>
                    @endif
                </div>
            </div>
        </div>
    </div>
</div>
@endsection