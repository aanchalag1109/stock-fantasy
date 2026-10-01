<h1>KYC Submissions</h1>
<table>
    <tr><th>User</th><th>Document</th><th>Status</th></tr>
    @foreach($kycs as $k)
    <tr>
        <td>{{ $k->user->name }}</td>
        <td>{{ $k->document_type }}</td>
        <td>{{ $k->status }}</td>
    </tr>
    @endforeach
</table>