
@extends('admin.layouts.app')

@section('title', 'KYC Submission Details')

@section('content')
<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-8">
            <div class="card shadow-sm mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="fw-bold">KYC Submission #{{ $submission->id }}</span>
                    <span>
                        @if($submission->status == 'pending')
                            <span class="badge bg-warning text-dark">Pending</span>
                        @elseif($submission->status == 'approved')
                            <span class="badge bg-success">Approved</span>
                        @else
                            <span class="badge bg-danger">Rejected</span>
                        @endif
                    </span>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h5 class="mb-3">User Info</h5>
                            <ul class="list-group list-group-flush">
                                <li class="list-group-item"><strong>Name:</strong> {{ $submission->user->name }}</li>
                                <li class="list-group-item"><strong>Document Type:</strong> {{ $submission->document_type }}</li>
                                <li class="list-group-item"><strong>Document Number:</strong> {{ $submission->document_number }}</li>
                                <li class="list-group-item"><strong>Submitted At:</strong> {{ $submission->created_at->format('Y-m-d H:i') }}</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h5 class="mb-3">Uploaded Documents</h5>
                            <div class="mb-2">
                                <strong>Front Image:</strong><br>
                                <img src="{{ asset('storage/' . $submission->front_image) }}" alt="Front Image" class="img-thumbnail" style="max-width: 200px;">
                            </div>
                            @if($submission->back_image)
                            <div class="mb-2">
                                <strong>Back Image:</strong><br>
                                <img src="{{ asset('storage/' . $submission->back_image) }}" alt="Back Image" class="img-thumbnail" style="max-width: 200px;">
                            </div>
                            @endif
                            <div class="mb-2">
                                <strong>Selfie Image:</strong><br>
                                <img src="{{ asset('storage/' . $submission->selfie_image) }}" alt="Selfie Image" class="img-thumbnail" style="max-width: 200px;">
                            </div>
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <a href="{{ route('admin.kyc.index') }}" class="btn btn-outline-secondary">
                            <i class="bi bi-arrow-left"></i> Back to KYC Submissions
                        </a>
                        @if($submission->status == 'pending')
                            <form action="{{ route('admin.kyc.approve', $submission->id) }}" method="POST" class="d-inline">
                                @csrf
                                <button type="submit" class="btn btn-success" onclick="return confirm('Approve this KYC?')">
                                    <i class="bi bi-check-circle"></i> Approve
                                </button>
                            </form>
                            <form action="{{ route('admin.kyc.reject', $submission->id) }}" method="POST" class="d-inline">
                                @csrf
                                <button type="submit" class="btn btn-danger" onclick="return confirm('Reject this KYC?')">
                                    <i class="bi bi-x-circle"></i> Reject
                                </button>
                            </form>
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection