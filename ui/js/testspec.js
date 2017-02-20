
//show all testspecs
app.controller('TestspecsController', function($scope, $route, toaster, $http, jwtHelper, $location, serverconf, scaMessage, users, testspecs, $modal, $routeParams) {
    scaMessage.show(toaster);
    $scope.active_menu = "testspecs";

    users.getAll().then(function(_users) {
        $scope.users = _users;
        testspecs.getAll().then(function(_testspecs) { 
            $scope.testspecs = _testspecs; 
            //find task specified
            if($routeParams.id) {
                $scope.testspecs.forEach(function(testspec) {
                    if(testspec._id == $routeParams.id) $scope.select(testspec);
                });
            } else {
                //select first one
                if($scope.testspecs.length > 0) $scope.select($scope.testspecs[0]);
            }
        });
    });

    $scope.selected = null;
    $scope.select = function(testspec) {
        //TODO - maybe I should catch $dirty flag here.. but what about page nagivation?
        $scope.selected = testspec; 

        $scope.closesubbar();
        $location.update_path("/testspecs/"+testspec._id);
        window.scrollTo(0,0);

        $scope.minver = $scope.serverconf.minver[testspec.service_type];
    }

    $scope.add = function() {
        $scope.selected = testspecs.add();
        $scope.closesubbar();
        $location.update_path("/testspecs");
    }

    $scope.setdefault = function(type) {
        var def = $scope.serverconf.defaults.testspecs[type];
        $scope.selected.specs = angular.copy(def);
    }

    //some special behaviors on form
    $scope.$watch('selected.specs.ipv4_only', function(nv, ov) {
        if(nv) {
            delete $scope.selected.specs.ipv6_only;
        }
    });
    $scope.$watch('selected.specs.ipv6_only', function(nv, ov) {
        if(nv) {
            delete $scope.selected.specs.ipv4_only;
        }
    });

    $scope.submit = function() {
        //remove parameter set to empty, null, or false
        for(var k in $scope.selected.specs) {
            if(!$scope.selected.specs[k]) delete $scope.selected.specs[k];
        }

        //remove parameters that aren't shown on the UI
        for(var k in $scope.selected.specs) {
            if($scope.form[k] === undefined) {
                console.log("no such field:"+k+" removing (maybe from bad default?)");
                delete $scope.selected.specs[k];
            }
        }

        if(!$scope.selected._id) {
            testspecs.create($scope.selected).then(function(testspec) {
                toaster.success("Testspec created successfully!");
                $scope.form.$setPristine();
                $location.update_path("/testspecs/"+testspec._id);
            }).catch($scope.toast_error);
        } else {
            testspecs.update($scope.selected).then(function(testspec) {
                toaster.success("Testspec updated successfully!");
                $scope.form.$setPristine();
            }).catch($scope.toast_error);
        }
    }
    $scope.cancel = function() {
        location.reload();
    }
    $scope.remove = function() {
        testspecs.remove($scope.selected).then(function() {
            toaster.success("Removed successfully");
            $scope.selected = null;
        }).catch($scope.toast_error);
    }
});

