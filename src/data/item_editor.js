self.on('message', function (res) {
    // console.log(res);
    if (res.name == 'onshow') {
        $("#item_name").text(res.data['name']);
        $("#created_by").text(res.data['created_by']);
        $("#updated_at").text(res.data['updated_at']);
        $("#created_at").text(res.data['created_at']);
        $("#resource_url").text(res.data['resource_url']);
        $("#data_exampleUrl").text(res.data['data']['exampleUrl']);
        $("#data_url").val(res.data['data']['url']);
        $("#data_nextLink").val(res.data['data']['nextLink']);
        $("#data_pageElement").val(res.data['data']['pageElement']);
        $("#item_save").on('click', function() {
            save_item(res.data);
        });
    }
});

function save_item(origin_data) {
    var isModified = false;
    var url = $("#data_url").val();
    var nextLink = $("#data_nextLink").val();
    var pageElement = $("#data_pageElement").val();

    if ( url != origin_data['data']['url'] 
        || nextLink != origin_data['data']['nextLink'] 
        || pageElement != origin_data['data']['pageElement'] ) {
        isModified = true;
    }

    self.postMessage({
        name: 'save',
        isModified: isModified,
        data: {
            url: url,
            nextLink: nextLink,
            pageElement: pageElement,
            name: origin_data['name']
        }
    });
}
