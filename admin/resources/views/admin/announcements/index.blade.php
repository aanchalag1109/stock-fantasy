
@extends('admin.layouts.app')

@section('title', 'Announcements')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-2">Announcements</h1>
            <p class="mb-0">View and manage all system announcements</p>
        </div>
        <div>
            <button id="bulkDeleteBtn" class="btn btn-danger me-2" style="display:none;" onclick="bulkDelete()">
                <i class="bi bi-trash me-2"></i> Delete Selected
            </button>
            <a href="{{ route('admin.announcements.create') }}" class="btn btn-primary">
                <i class="bi bi-plus-lg me-2"></i> Create New Announcement
            </a>
        </div>
    </div>
    <div class="card shadow-sm mb-4">
        <div class="card-header fw-bold">Announcements</div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table align-middle mb-0">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll"></th>
                            <th>ID</th>
                            <th>Title</th>
                            <th>Type</th>
                            <th>Created At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($announcements as $announcement)
                        <tr>
                            <td><input type="checkbox" class="announcement-checkbox" value="{{ $announcement->id }}"></td>
                            <td>{{ $announcement->id }}</td>
                            <td>{{ $announcement->title }}</td>
                            <td>
                                @if($announcement->type == 'update')
                                    <span class="badge bg-info text-dark">Update</span>
                                @elseif($announcement->type == 'alert')
                                    <span class="badge bg-danger">Alert</span>
                                @elseif($announcement->type == 'promo')
                                    <span class="badge bg-success">Promo</span>
                                @else
                                    <span class="badge bg-secondary">Other</span>
                                @endif
                            </td>
                            <td>{{ $announcement->created_at->format('Y-m-d H:i') }}</td>
                            <td>
                                <a href="{{ route('admin.announcements.show', $announcement->id) }}" class="btn btn-sm btn-outline-info me-1">
                                    <i class="bi bi-eye"></i> View
                                </a>
                                <form action="{{ route('admin.announcements.destroy', $announcement->id) }}" method="POST" class="d-inline">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Are you sure?')">
                                        <i class="bi bi-trash"></i> Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="text-center text-muted">No announcements found.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if(method_exists($announcements, 'links'))
            <div class="card-footer bg-white py-3">
                <nav>
                    {!! $announcements->withQueryString()->links('pagination::bootstrap-5') !!}
                </nav>
            </div>
            @endif
        </div>
    </div>
</div>

<script>
document.getElementById('selectAll').addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.announcement-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
    toggleBulkDeleteBtn();
});

document.querySelectorAll('.announcement-checkbox').forEach(cb => {
    cb.addEventListener('change', toggleBulkDeleteBtn);
});

function toggleBulkDeleteBtn() {
    const checked = document.querySelectorAll('.announcement-checkbox:checked').length;
    document.getElementById('bulkDeleteBtn').style.display = checked > 0 ? 'inline-block' : 'none';
}

function bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.announcement-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return;
    
    if (!confirm(`Delete ${selected.length} announcement(s)?`)) return;
    
    fetch('{{ route("admin.announcements.bulk-delete") }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({ ids: selected })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => alert('Error: ' + error.message));
}
</script>
@endsection