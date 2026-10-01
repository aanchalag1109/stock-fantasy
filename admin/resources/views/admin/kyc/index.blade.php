
@extends('admin.layouts.app')

@section('title', 'KYC Submissions')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-2">KYC Submissions</h1>
            <p class="mb-0">Review and manage user KYC submissions</p>
        </div>
    </div>
    <div class="card shadow-sm mb-4">
        <div class="card-header fw-bold">KYC Submissions</div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table align-middle mb-0">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>User</th>
                            <th>Document Type</th>
                            <th>Document Number</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($submissions as $submission)
                        <tr>
                            <td>{{ $submission->id }}</td>
                            <td>{{ $submission->user->name }}</td>
                            <td>{{ $submission->document_type }}</td>
                            <td>{{ $submission->document_number }}</td>
                            <td>
                                @if($submission->status == 'pending')
                                    <span class="badge bg-warning text-dark">Pending</span>
                                @elseif($submission->status == 'approved')
                                    <span class="badge bg-success">Approved</span>
                                @else
                                    <span class="badge bg-danger">Rejected</span>
                                @endif
                            </td>
                            <td>{{ $submission->created_at->format('Y-m-d H:i') }}</td>
                            <td>
                                <a href="{{ route('admin.kyc.show', $submission->id) }}" class="btn btn-sm btn-outline-primary me-1">
                                    <i class="bi bi-eye"></i> View
                                </a>
                                @if($submission->status == 'pending')
                                    <form action="{{ route('admin.kyc.approve', $submission->id) }}" method="POST" class="d-inline">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-success" onclick="return confirm('Approve this KYC?')">
                                            <i class="bi bi-check-circle"></i> Approve
                                        </button>
                                    </form>
                                    <form action="{{ route('admin.kyc.reject', $submission->id) }}" method="POST" class="d-inline">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Reject this KYC?')">
                                            <i class="bi bi-x-circle"></i> Reject
                                        </button>
                                    </form>
                                @endif
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="text-center text-muted">No KYC submissions found.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if(method_exists($submissions, 'links'))
            <div class="card-footer bg-white py-3">
                <nav>
                    {!! $submissions->withQueryString()->links('pagination::bootstrap-5') !!}
                </nav>
            </div>
            @endif
        </div>
    </div>
</div>
@endsection