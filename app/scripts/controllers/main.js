/*******************************************************************************
 * (C) Copyright IBM Corporation  2016, 2017
 * All Rights Reserved
 *******************************************************************************/

/* globals window: true */

angular.module('itapapersApp')

.controller('MainCtrl', ['$scope', '$stateParams', '$location', '$sce', '$window', 'store', 'charts', 'documentTypes', 'utils', 'csv', 'colours', 'localStorageService', 'urls', 'definitions', function ($scope, $stateParams, $location, $sce, $window, store, charts, documentTypes, utils, csv, colours, localStorageService, urls, ce) {
  'use strict';

  $scope.scienceLibrary = urls.scienceLibrary;
  $scope.accepted = 'accepted';
  $scope.listLength = 100;
  $scope.listDelta = 100;
  $scope.listTypes = {
    papers:   'papers',
    authors:  'authors',
    venues:   'venues',
    projects: 'projects',
    organisations: 'organisations',
    coauthors:  'co-authors',
    topics:     'topics'
  };
  $scope.sortTypes = {
    'papers': {
      names:    ['most collaborative', 'citation count', 'most recent', 'name'],
      values:   ['weight', 'citations', 'date', 'name'],
      show:     [false, true, true, false],
      reverse: ['-', '-', '-', '+']
    },
    'authors': {
      names:    ['external paper count', 'local citation count', 'local h-index', 'global citation count', 'global h-index', 'co-author count', 'name'],
      values:   ['externalCount', 'localCitations', 'localHIndex', 'overallCitations', 'overallHIndex', 'coAuthors', 'name'],
      show:     [true, true, true, true, true, true, false],
      reverse:  ['-', '-', '-', '-', '-', '-', '+']
    },
    'venues': {
      names:    ['external paper count', 'author count', 'citation count', 'years attended', 'name'],
      values:   ['papers', 'authors', 'citations', 'duration', 'name'],
      show:     [true, true, true, true, false],
      reverse:  ['-', '-', '-', '-', '+']
    },
    'projects': {
      names:    ['external paper count', 'author count', 'organisation count', 'citation count', 'name'],
      values:   ['papers', 'authors', 'organisations', 'citations', 'name'],
      show:     [true, true, true, true, false],
      reverse:  ['-', '-', '-', '-', '+']
    },
    'organisations': {
      names:    ['authors', 'external paper count', 'citation count', 'name'],
      values:   ['value', 'externalCount', 'citations', 'name'],
      show:     [true, true, true, false],
      reverse:  ['-', '-', '-', '+']
    },
    'co-authors': {},
    'topics': {
      names:    ['external paper count', 'author count', 'organisation count', 'citation count', 'name'],
      values:   ['papers', 'authors', 'organisations', 'citations', 'name'],
      show:     [true, true, true, true, true, false],
      reverse:  ['-', '-', '-', '-', '+']
    }
  };

  $scope.journalType            = documentTypes.journal;
  $scope.externalConferenceType = documentTypes.external;
  $scope.patentType             = documentTypes.patent;
  $scope.internalConferenceType = documentTypes.internal;
  $scope.technicalReportType    = documentTypes.technical;
  $scope.otherDocumentType      = documentTypes.other;
  $scope.journalInput = $scope.externalInput = $scope.patentInput = $scope.internalInput = $scope.technicalInput = $scope.otherInput = $scope.acInput = $scope.indInput = $scope.govInput = true;

  $scope.scatterYAxisOpts = ['localHIndex', 'localCitations', 'overallHIndex', 'overallCitations'];
  $scope.scatterYAxis = $scope.scatterYAxisOpts[0];

  var types = documentTypes.nameMap;

  $scope.formatSortValue = function(rawVal, sortName) {
    return utils.formatSortValue(rawVal, sortName);
  };

  var resetTypeCount = function() {
    $scope.typeCount = {};
    $scope.typeCount[types[$scope.journalType]] = 0;
    $scope.typeCount[types[$scope.externalConferenceType]] = 0;
    $scope.typeCount[types[$scope.patentType]] = 0;
    $scope.typeCount[types[$scope.internalConferenceType]] = 0;
    $scope.typeCount[types[$scope.technicalReportType]] = 0;
    $scope.typeCount[types[$scope.otherDocumentType]] = 0;
  };

  resetTypeCount();

  $scope.seeMore = function() {
    $scope.listLength += $scope.listDelta;
  };

  $scope.select = function(type) {
    $scope.listName = type;
    $scope.list = [];
    $scope.sort = $scope.sortTypes[type];
    getData();
  };

  // get window size
  $scope.width  = window.innerWidth;
  $scope.height = window.innerHeight;

  // set max-height of results lists
  var resultsListElems = angular.element('.results-list');
  var maxHeight = $scope.height - 305;
  resultsListElems.css('max-height', maxHeight + 'px');

  $scope.filterPapers = function(value) {
    if (typeof value.type !== 'undefined') {
      return ($scope.journalInput &&
          value.type.indexOf(types[$scope.journalType]) > -1) ||
        ($scope.externalInput &&
          value.type.indexOf(types[$scope.externalConferenceType]) > -1) ||
        ($scope.patentInput &&
          value.type.indexOf(types[$scope.patentType]) > -1) ||
        ($scope.internalInput &&
          value.type.indexOf(types[$scope.internalConferenceType]) > -1) ||
        ($scope.technicalInput &&
          value.type.indexOf(types[$scope.technicalReportType]) > -1) ||
        ($scope.otherInput &&
          value.type.indexOf(types[$scope.otherDocumentType]) > -1);
    }
  };

  $scope.filterOrganisations = function(value) {
    return ($scope.acInput && value.area === 'AC') ||
    ($scope.indInput && value.area === 'IND') ||
    ($scope.govInput && value.area === 'GOV');
  };

  var filterData = function(instances) {
    var documentMap = {};
    var paperId, thisInst, i;

    // loop through query results
    //    - remove results with multiple citations
    //    - select citation count with most citations
    //    - collapse variants into one entry
    for (i in instances) {
      thisInst = instances[i];

      if (utils.isConcept(thisInst, ce.concepts.document)) {
        paperId = thisInst._id;
        var paperProps = thisInst.property_values;

        // paper properties
        var citationCount = utils.getHighestIntProperty(paperProps, ce.paper.citationCount);
        var variantList = utils.getListProperty(paperProps, ce.paper.variantList);
        var paperType = utils.getType(thisInst.concept_names);

        // ignore duplicates
        if (!documentMap[paperId]) {
          var variantFound = false;
          var maxCitations = 0;

          // find max variant
          if (variantList) {
            for (var j = 0; j < variantList.length; ++j) {
              var variantId = variantList[j];

              if (documentMap[variantId]) {
                maxCitations = documentMap[variantId].citations > maxCitations ? documentMap[variantId].citations : maxCitations;
                variantFound = variantId;
              }
            }
          }

          // set citation count in map
          if (!variantFound) {
            documentMap[paperId] = {
              citations: citationCount,
              index: i,
              types: [paperType]
            };
          } else {
            if (maxCitations < citationCount) {
              var variantTypes = documentMap[variantFound].types.slice();
              documentMap[variantFound] = null;
              documentMap[paperId] = {
                citations: citationCount,
                index: i,
                types: [paperType].concat(variantTypes)
              };
            } else {
              documentMap[variantFound].types.push(paperType);
            }
          }
        }
      }
    }

    var filteredResults = [];
    var instancesObj = {};

    // recreate array - test for index to remove duplicate citations
    for (i in instances) {
      thisInst = instances[i];
      paperId = thisInst._id;

      instancesObj[paperId] = thisInst;

      if (documentMap[paperId] && documentMap[paperId].index === i) {
        filteredResults.push([ paperId, documentMap[paperId].types ]);
      }
    }

    var filteredData = {
      instances: instancesObj,
      data: filteredResults
    };

    return filteredData;
  };

  var convertInstancesToResults = function(data) {
    var idList = [];
    var instObj = {};

    for (var i in data) {
      var thisInst = data[i];
      idList.push([thisInst._id]);
      instObj[thisInst._id] = thisInst;
    }

    var result = {
      results: idList,
      instances: instObj
    };

    return result;
  };

  var populateList = function(data, instances) {
    $scope.list       = [];
    $scope.areaNames  = [];
    $scope.projects   = {};
    var authorIds = {};
    resetTypeCount();

    // loop through results and extract relevant data
    for (var i = 0; i < data.length; ++i) {
      var type, className;

      var id = data[i][0];

      if ($scope.listName === $scope.listTypes.papers) {
        // papers page
        var paperProps = instances[id].property_values;

        // paper properties
        var paperName = utils.getUnknownProperty(paperProps, ce.paper.title);
        var paperDate = utils.getDateProperty(paperProps, ce.paper.finalDate);
        var paperCitationCount = utils.getHighestIntProperty(paperProps, ce.paper.citationCount);
        var paperWeight = utils.getHighestIntProperty(paperProps, ce.paper.weight);
        var noteworthyReason = utils.getProperty(paperProps, ce.paper.noteworthyReason);
        var noteworthyUrl = utils.getProperty(paperProps, ce.paper.noteworthyUrl);
        var paperStatus = utils.getProperty(paperProps, ce.paper.status);

        // set types for duplicates and non-duplicates
        var types = data[i][1];
        var j;
        if (types.length > 1) {
          type = utils.sortTypes(types);
          for (j in types) {
            if (types.hasOwnProperty(j)) {
              $scope.typeCount[types[j]]++;
            }
          }
        } else {
          type = [types[0]];
          $scope.typeCount[type]++;
        }

        // generate class names
        className = [];
        for (j = 0; j < type.length; ++j) {
          className.push(utils.getClassName(type[j]));
        }

        // push data to list
        $scope.list.push({
          id:         id,
          name:       paperName,
          date:       paperDate,
          citations:  paperCitationCount,
          weight:     paperWeight,
          type:       type,
          class:      className,
          noteworthy: noteworthyReason,
          url:        noteworthyUrl,
          status:     paperStatus
        });
      } else if ($scope.listName === $scope.listTypes.authors) {
        // authors page
        var authorProps = instances[data[i][0]].property_values;

        // author properties
        var authorName = utils.getProperty(authorProps, ce.author.fullName);
        var authorCitationCount = utils.getHighestIntProperty(authorProps, ce.author.localCitationCount);
        var authorHIndex = utils.getHighestIntProperty(authorProps, ce.author.localHIndex);
        var authorDocumentCount = utils.getHighestIntProperty(authorProps, ce.author.documentCount);
        var authorExternalCount = utils.getHighestIntProperty(authorProps, ce.author.externalDocumentCount);
        var authorCoAuthorCount = utils.getHighestIntProperty(authorProps, ce.author.coAuthorCount);
        var authorOverallCitationCount = utils.getLatestIntProperty(authorProps, ce.author.overallCitationCount);
        var authorOverallHIndex = utils.getLatestIntProperty(authorProps, ce.author.overallHIndex);

        if (!authorIds[id]) {
          authorIds[id] = true;
          // push data to list
          $scope.list.push({
            id:               id,
            name:             authorName,
            localCitations:   authorCitationCount,
            localHIndex:      authorHIndex,
            overallCitations: authorOverallCitationCount,
            overallHIndex:    authorOverallHIndex,
            coAuthors:        authorCoAuthorCount,
            totalPubs:        authorDocumentCount,
            externalCount:    authorExternalCount
          });
        }
      } else if ($scope.listName === $scope.listTypes.venues) {
        // venues page
        // authors page
        var venueProps = instances[data[i][0]].property_values;

        var name = utils.getProperty(venueProps, ce.series.name);
        var venuePaperCount = utils.getIntProperty(venueProps, ce.series.externalDocumentCount);
        var venueAuthorCount = utils.getIntProperty(venueProps, ce.series.authorCount);
        var venueCitationCount = utils.getIntProperty(venueProps, ce.series.citationCount);;
        var venueDuration = utils.getIntProperty(venueProps, ce.series.duration)

        // push data to list
        $scope.list.push({
          id:   instances[data[i][0]]._id,
          name: name,
          papers: venuePaperCount,
          authors: venueAuthorCount,
          citations: venueCitationCount,
          duration: venueDuration
        });
      } else if ($scope.listName === $scope.listTypes.projects) {
        // projects page
        var projectProps = instances[id].property_values;

        // project properties
        var projectName = utils.getProperty(projectProps, ce.project.name);
        var projectDocumentCount = utils.getHighestIntProperty(projectProps, ce.project.externalDocumentCount);
        var projectAuthorCount = utils.getHighestIntProperty(projectProps, ce.project.authorCount);
        var projectOrganisationCount = utils.getHighestIntProperty(projectProps, ce.project.organisationCount);
        var projectCitationCount = utils.getHighestIntProperty(projectProps, ce.project.citationCount);

        // push data to list
        $scope.list.push({
          id:     id,
          name:     projectName,
          papers: projectDocumentCount,
          authors: projectAuthorCount,
          organisations: projectOrganisationCount,
          citations: projectCitationCount
        });
      } else if ($scope.listName === $scope.listTypes.organisations) {
        // organisations page
        var orgProps = instances[id].property_values;

        // organisation properties
        var orgName = utils.getProperty(orgProps, ce.organisation.name);
        var orgEmployeeList = utils.getListProperty(orgProps, ce.organisation.employeeList);
        var orgDocumentCount = utils.getHighestIntProperty(orgProps, ce.organisation.documentCount);
        var orgExternalCount = utils.getHighestIntProperty(orgProps, ce.organisation.externalDocumentCount);
        var orgCitationCount = utils.getHighestIntProperty(orgProps, ce.organisation.citationCount);
        var empLen = 0;
        var orgType = utils.getIndustryFor(instances[id]);
        if (orgType) {
          className = utils.getClassName(orgType);
        }

        if (orgEmployeeList != null) {
          empLen = orgEmployeeList.length;
        }

        // push data to list
        $scope.list.push({
          id:     id,
          name:   orgName,
          value:  empLen,
          papers: orgDocumentCount,
          externalCount: orgExternalCount,
          citations: orgCitationCount,
          area:   orgType,
          class:  className
        });
      } else if ($scope.listName === $scope.listTypes.topics) {
        // topics page
        var topicProps = instances[id].property_values;

        // topic properties
        var topicDocumentCount = utils.getHighestIntProperty(topicProps, ce.topic.externalDocumentCount);
        var topicAuthorCount = utils.getHighestIntProperty(topicProps, ce.topic.authorCount);
        var topicOrganisationCount = utils.getHighestIntProperty(topicProps, ce.topic.organisationCount);
        var topicCitationCount = utils.getHighestIntProperty(topicProps, ce.topic.citationCount);

        // push data to list
        $scope.list.push({
          id:     id,
          papers: topicDocumentCount,
          authors: topicAuthorCount,
          organisations: topicOrganisationCount,
          citations: topicCitationCount
        });
      }
    }
  };

  var getData = function() {
    store.getLastUpdated()
      .then(function(response) {
        var foundComputeMessage = false;
        var lastUpdatedText = '';
        var projectName = '';

        if (response.results.length > 0) {
          for (var i in response.results) {
            if (response.results.hasOwnProperty(i)) {
              var msg = response.results[i];

              if (msg) {
                if (msg[0] === 'msg date') {
                  lastUpdatedText = msg[1];
                }
                if (msg[0] === 'msg computed') {
                  foundComputeMessage = true;
                }
                if (msg[0] === 'project name') {
                  projectName = msg[1];
                }
              }
            }
          }

          if (!foundComputeMessage) {
            lastUpdatedText += ' (Computed data not yet generated)';
          }
        } else {
          lastUpdatedText = '(Computed data not found)';
          projectName = 'Project name not found';
        }

        $scope.lastUpdated = lastUpdatedText;
        $scope.projectName = projectName;
      });

    if ($scope.listName === $scope.listTypes.papers) {
      store.getDocuments()
        .then(function(rawResults) {
          var results = filterData(rawResults);

          populateList(results.data, results.instances);

          $scope.journalPapers = $scope.typeCount[types[$scope.journalType]];
          $scope.externalPapers = $scope.typeCount[types[$scope.externalConferenceType]];
          $scope.patents = $scope.typeCount[types[$scope.patentType]];
          $scope.internalPapers = $scope.typeCount[types[$scope.internalConferenceType]];
          $scope.technicalReports = $scope.typeCount[types[$scope.technicalReportType]];
          $scope.otherDocuments = $scope.typeCount[types[$scope.otherDocumentType]];
          $scope.totalPublications = $scope.journalPapers + $scope.externalPapers + $scope.patents;

          $scope.pieData = [{
            label: types[$scope.journalType],
            value: $scope.journalPapers
          }, {
            label: types[$scope.externalConferenceType],
            value: $scope.externalPapers
          }, {
            label: types[$scope.patentType],
            value: $scope.patents
          }, {
            label: types[$scope.internalConferenceType],
            value: $scope.internalPapers
          }, {
            label: types[$scope.technicalReportType],
            value: $scope.technicalReports
          }, {
            label: types[$scope.otherDocumentType],
            value: $scope.otherDocuments
          }];
        });
    } else if ($scope.listName === $scope.listTypes.authors) {
      store.getPublishedPeople()
        .then(function(rawData) {
          var data = convertInstancesToResults(rawData);
          populateList(data.results, data.instances);
          $scope.options = charts.getScatterData(data, urls.server);
        });
    } else if ($scope.listName === $scope.listTypes.venues) {
      store.getEventSeries()
        .then(function(rawData) {
          var data = convertInstancesToResults(rawData);
          populateList(data.results, data.instances);
        });
    } else if ($scope.listName === $scope.listTypes.projects) {
      store.getProjects()
        .then(function(rawData) {
          var data = convertInstancesToResults(rawData);
          populateList(data.results, data.instances);
        });
    } else if ($scope.listName === $scope.listTypes.organisations) {
      store.getOrganisations()
        .then(function(rawData) {
          var data = convertInstancesToResults(rawData);
          populateList(data.results, data.instances);
          $scope.sunburstData = charts.getSunburstData(data);
        });
    } else if ($scope.listName === $scope.listTypes.topics) {
      store.getTopics()
        .then(function(rawData) {
          var data = convertInstancesToResults(rawData);
          populateList(data.results, data.instances);
        });
    }
  };

  if ($stateParams.category) {
    $scope.select($scope.listTypes[$stateParams.category]);
  } else {
    $scope.select($scope.listTypes.papers);
  }
}]);
