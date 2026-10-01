@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="card">
        <div class="card-header bg-warning text-dark d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-cash-coin me-2"></i>Test Transactions</h5>
            <button class="btn btn-dark btn-sm" onclick="createTestTransaction()">
                <i class="bi bi-plus-circle me-1"></i>Create New
            </button>
        </div>
        <div class="card-body">
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Transaction ID</th>
                            <th>User</th>
                            <th>Contest</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Description</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody id="transactionsTable">
                        <tr>
                            <td colspan="8" class="text-center">
                                <div class="spinner-border text-primary" role="status"></div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    loadTransactions();
});

function loadTransactions() {
    fetch('{{ url('/api/test-transactions') }}')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('transactionsTable');
            if (data.transactions && data.transactions.length > 0) {
                tbody.innerHTML = data.transactions.map(t => `
                    <tr>
                        <td>${t.id}</td>
                        <td><code>${t.transaction_id}</code></td>
                        <td>${t.user_id}</td>
                        <td>${t.contest_id || '-'}</td>
                        <td class="text-success fw-bold">₹${parseFloat(t.amount).toFixed(2)}</td>
                        <td><span class="badge bg-success">${t.status}</span></td>
                        <td>${t.description || '-'}</td>
                        <td>${new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No test transactions found</td></tr>';
            }
        })
        .catch(error => {
            document.getElementById('transactionsTable').innerHTML = 
                '<tr><td colspan="8" class="text-center text-danger">Error loading transactions</td></tr>';
        });
}

function createTestTransaction() {
    if (!confirm('Create a new test transaction?')) return;
    
    fetch('{{ url('/api/test-transaction-contest/1') }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Test transaction created!');
            loadTransactions();
        } else {
            alert('Error: ' + (data.message || 'Failed'));
        }
    })
    .catch(error => alert('Error: ' + error.message));
}
</script>
@endsection
