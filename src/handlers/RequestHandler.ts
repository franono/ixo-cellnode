import { Document, Schema, Model, model } from "mongoose";
import { AbstractHandler } from './AbstractHandler';
import { Request } from "../handlers/Request";
import InitHandler from './InitHandler';

import walletService from '../service/WalletService';

const BLOCKCHAIN_URI_REST = (process.env.BLOCKCHAIN_URI_REST || '');

/////////////////////////////////////////////////
//  PROJECT MODEL                              //
/////////////////////////////////////////////////

export interface IProjectModel extends Document {
  autoApprove: [string],
  evaluatorPayPerClaim: number
}

var ProjectSchema: Schema = new Schema({
  autoApprove: [],
  evaluatorPayPerClaim: Number
}, { strict: false });

ProjectSchema.pre("save", function (next) {
  next();
});

export const Project: Model<IProjectModel> = model<IProjectModel>("Project", ProjectSchema);


/////////////////////////////////////////////////
//   AGENT MODEL                               //
/////////////////////////////////////////////////
export interface IAgentModel extends Document { role: string }

var AgentSchema: Schema = new Schema({
  role: String
}, { strict: false });

AgentSchema.pre("save", function (next) {
  next();
});

export const Agent: Model<IAgentModel> = model<IAgentModel>("Agent", AgentSchema);

Agent.on("postCommit", function (obj) {
  Project.findOne({
    projectDid: obj.projectDid
  }).then((project) => {
    if (project) {
      let status = (project.autoApprove.some(function (element) { return (obj.role === element) })) ? "1" : "0";
      let requestHandler = new RequestHandler();
      var data: any = {
        projectDid: obj.projectDid,
        status: status,
        agentDid: obj.agentDid,
        role: obj.role
      }
      requestHandler.selfSignMessage(data, obj.projectDid)
        .then((signature: any) => {
          var statusRequest: any = {
            payload: {
              template: {
                name: "agent_status"
              },
              data: data
            },
            signature: {
              type: "ed25519-sha-256",
              created: new Date().toISOString(),
              creator: obj.projectDid,
              signatureValue: signature
            }
          }
          requestHandler.updateAgentStatus(statusRequest);
        });
    }
  });
});

/////////////////////////////////////////////////
//   AGENT STATUS MODEL                        //
/////////////////////////////////////////////////

export interface IAgentStatusModel extends Document { }

var AgentStatusSchema: Schema = new Schema({}, { strict: false });

AgentStatusSchema.pre("save", function (next) {
  next();
});

export const AgentStatus: Model<IAgentStatusModel> = model<IAgentStatusModel>("AgentStatus", AgentStatusSchema);

/////////////////////////////////////////////////
//   CLAIM MODEL                               //
/////////////////////////////////////////////////
export interface IClaimModel extends Document { }

var ClaimSchema: Schema = new Schema({}, { strict: false });

ClaimSchema.pre("save", function (next) {
  next();
});

export const Claim: Model<IClaimModel> = model<IClaimModel>("Claim", ClaimSchema);

/////////////////////////////////////////////////
//   EVALUATE CLAIM MODEL                      //
/////////////////////////////////////////////////
export interface IEvaluateClaimModel extends Document { }

var EvaluateClaimSchema: Schema = new Schema({}, { strict: false });

EvaluateClaimSchema.pre("save", function (next) {
  next();
});

export const EvaluateClaim: Model<IEvaluateClaimModel> = model<IEvaluateClaimModel>("EvaluateClaim", EvaluateClaimSchema);

export class RequestHandler extends AbstractHandler {

  constructor() {
    super();
  }

  updateCapabilities(request: Request, methodCall: string) {
    switch (methodCall) {
      case 'UpdateAgentStatus': {
        if (request.data.role === 'SA' && request.data.status === '1') this.addCapabilities(request.projectDid, request.data.agentDid, 'SubmitClaim');
        if (request.data.role === 'EA' && request.data.status === '1') this.addCapabilities(request.projectDid, request.data.agentDid, 'EvaluateClaim');
        if (request.data.status === '1') this.addCapabilities(request.projectDid, request.data.agentDid, 'ListClaims');
        if (request.data.role === 'SA' && request.data.status === '2') this.removeCapabilities(request.projectDid, request.data.agentDid, 'SubmitClaim');
        if (request.data.role === 'EA' && request.data.status === '2') this.removeCapabilities(request.projectDid, request.data.agentDid, 'EvaluateClaim');
        if (request.data.status === '2') this.removeCapabilities(request.projectDid, request.data.agentDid, 'ListClaims');
        break;
      }
      case 'CreateProject': {
        this.addCapabilities(request.projectDid, 'did:sov:*', 'CreateAgent');
        this.addCapabilities(request.projectDid, request.signature.creator, 'UpdateAgentStatus');
        this.addCapabilities(request.projectDid, request.projectDid, 'UpdateAgentStatus');
        this.addCapabilities(request.projectDid, request.signature.creator, 'ListAgents');
        this.addCapabilities(request.projectDid, request.signature.creator, 'ListClaims');
        break;
      }
      default: {
        break;
      }
    }
  }

  msgToPublish(obj: any, request: Request, methodCall: string): any {
    return new Promise((resolve: Function, reject: Function) => {
      var txHash = obj.txHash;
      delete obj.version;
      delete obj.txHash;
      delete obj._creator;
      delete obj._created;
      switch (methodCall) {
        case 'CreateProject': {
          delete obj.autoApprove;
          walletService.getWallet(request.projectDid)
            .then((wallet) => {
              let blockChainPayload = {
                payload: [16, {
                  data: {
                    ...obj,
                    createdOn: request.signature.created,
                    createdBy: request.signature.creator
                  },
                  txHash: txHash,
                  senderDid: request.signature.creator,
                  projectDid: request.projectDid,
                  pubKey: wallet.verifyKey
                }]
              }
              resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
            })
          break;
        }
        case 'CreateAgent': {
          let blockChainPayload = {
            payload: [17, {
              data: {
                did: obj.agentDid,
                role: obj.role,
              },
              txHash: txHash,
              senderDid: request.signature.creator,
              projectDid: request.projectDid
            }]
          }
          resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
          break;
        }
        case 'UpdateAgentStatus': {
          let blockChainPayload = {
            payload: [18, {
              data: {
                did: obj.agentDid,
                status: obj.status,
                role: obj.role
              },
              txHash: txHash,
              senderDid: request.signature.creator,
              projectDid: request.projectDid
            }]
          }
          resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
          break;
        }
        case 'SubmitClaim': {
          let blockChainPayload = {
            payload: [19, {
              data: {
                claimID: txHash
              },
              txHash: txHash,
              senderDid: request.signature.creator,
              projectDid: request.projectDid
            }]
          }
          resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
          break;
        }
        case 'EvaluateClaim': {
          let blockChainPayload = {
            payload: [20, {
              data: {
                claimID: obj.claimId,
                status: obj.status
              },
              txHash: txHash,
              senderDid: request.signature.creator,
              projectDid: request.projectDid
            }]
          }
          resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
          break;
        }
        default: {
          reject('Capability does not exist')
          break;
        }
      }
    });
  }

  checkKycCredentials = (didDoc: any): boolean => {
    if (didDoc.credentials) {
      didDoc.credentials.forEach((element: any) => {
        if (element.credential.claim.KYCValidated === true) {
          return true;
        }
      });
    }
    return false;
  }

  preVerifyDidSignature(didDoc: any, request: Request, capability: string) {
    if (capability === 'CreateProject') {
      return this.checkKycCredentials(didDoc);
    }

    if (capability === 'CreateAgent') {
      if (request.data.role != 'SA') {
        return this.checkKycCredentials(didDoc);
      }
    }

    return true;
  }

  /////////////////////////////////////////////////
  //  HANDLE CREATE PROJECT                      //
  /////////////////////////////////////////////////

  createProject = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.generateProjectWallet()
      .then((did: any) => {
        return InitHandler.initialise(did)
          .then((response: any) => {
            return this.createTransaction(args, 'CreateProject', Project, undefined, did);
          });
      });
  }

  /////////////////////////////////////////////////
  //  HANDLE AGENT REQUESTS                      //
  /////////////////////////////////////////////////

  createAgent = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.createTransaction(args, 'CreateAgent', Agent, function (request: any): Promise<boolean> {
      return new Promise(function (resolve: Function, reject: Function) {
        Agent.find(
          {
            projectDid: request.data.projectDid,
            agentDid: request.data.agentDid
          },
          function (error: Error, results: IAgentModel[]) {
            if (error) {
              reject(error);
            } else {
              results.forEach(element => {
                if (element.role === request.data.role) resolve(true);
                if (element.role === 'EA' && request.data.role === 'SA') resolve(true);
                if (element.role === 'SA' && request.data.role === 'EA') resolve(true);
              });
              resolve(false);
            }
          });
      });
    });
  }


  updateAgentStatus = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.createTransaction(args, 'UpdateAgentStatus', AgentStatus, function (request: any): Promise<boolean> {
      let newVersion = request.version + 1;
      return new Promise(function (resolve: Function, reject: Function) {
        AgentStatus.findOne(
          {
            projectDid: request.data.projectDid,
            agentDid: request.data.agentDid,
            version: newVersion
          },
          function (error: Error, result: IAgentStatusModel) {
            if (error) {
              reject(error);
            } else {
              if (result) {
                resolve(true);
              }
              resolve(false);
            }
          }).limit(1);
      });
    })
  }

  listAgents = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.queryTransaction(args, 'ListAgents', function (filter: any): Promise<any[]> {
      return new Promise(function (resolve: Function, reject: Function) {
        Agent.aggregate([
          {
            $match: filter
          },
          {
            $lookup: {
              "from": "agentstatuses",
              let: {
                "agentDid": "$agentDid",
                "projectDid": "$projectDid"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: [
                            "$agentDid",
                            "$$agentDid"
                          ]
                        },
                        {
                          $eq: [
                            "$projectDid",
                            "$$projectDid"
                          ]
                        }
                      ]
                    }
                  }
                }
              ],
              as: "currentStatus"
            }
          },
          { $unwind: { path: "$currentStatus", preserveNullAndEmptyArrays: true } },
          { $sort: { "currentStatus.version": -1 } },
          {
            $group: {
              "_id": "$_id",
              "name": { $first: "$name" },
              "agentDid": { $first: "$agentDid" },
              "projectDid": { $first: "$projectDid" },
              "role": { $first: "$role" },
              "email": { $first: "$email" },
              "currentStatus": { $first: "$currentStatus" }
            }
          }
        ],
          function (error: Error, result: any[]) {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
      });
    });
  }

  /////////////////////////////////////////////////
  //  HANDLE CLAIM REQUESTS                      //
  /////////////////////////////////////////////////

  submitClaim = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.createTransaction(args, 'SubmitClaim', Claim);
  }

  checkForFunds(projectDid: string): Promise<boolean> {
    return new Promise((resolve: Function, reject: Function) => {
      console.log(new Date().getUTCMilliseconds() + ' confirm funds exists');
      resolve(true);
      // axios.get(BLOCKCHAIN_URI_REST + 'projectAccounts/' + projectDid)
      //   .then((response) => {
      //     if (response.status == 200) {
      //       response.data.forEach((element: any) => {
      //         if (element.did == projectDid) {
      //           Project.findOne({
      //             projectDid: projectDid
      //           })
      //             .then((project) => {
      //               if (project) {
      //                 resolve(element.balance - project.evaluatorPayPerClaim >= 0);
      //               }
      //               console.log(new Date().getUTCMilliseconds() + ' check for funds no project found for projectDid ' + projectDid);
      //               resolve(false);
      //             })
      //             .catch((err) => {
      //               console.log(new Date().getUTCMilliseconds() + ' error processing check for funds ' + err)
      //               resolve(false);
      //             });
      //         }
      //       })
      //     }
      //     console.log(new Date().getUTCMilliseconds() + ' no valid response check for funds from blockchain ' + response.statusText);
      //     resolve(false);
      //   })
      //   .catch((reason) => {
      //     console.log(new Date().getUTCMilliseconds() + ' check for funds could not connect to blockchain ' + reason);
      //     resolve(false);
      //   });
    });
  };

  evaluateClaim = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.checkForFunds(new Request(args).projectDid)
      .then((resp: boolean) => {
        if (resp) {
          return this.createTransaction(args, 'EvaluateClaim', EvaluateClaim, function (request: any): Promise<boolean> {
            let newVersion = request.version + 1;
            return new Promise(function (resolve: Function, reject: Function) {
              EvaluateClaim.findOne(
                {
                  projectDid: request.data.projectDid,
                  claimId: request.data.claimId,
                  version: newVersion
                },
                function (error: Error, result: IEvaluateClaimModel) {
                  if (error) {
                    reject(error);
                  } else {
                    if (result) {
                      resolve(true);
                    }
                    resolve(false);
                  }
                }).limit(1);
            });
          });
        }
        console.log(new Date().getUTCMilliseconds() + ' insufficient funds available');
        return 'Insufficient funds available';
      });
  }

  listClaims = (args: any) => {
    console.log(new Date().getUTCMilliseconds() + ' start new transaction ' + JSON.stringify(args));
    return this.queryTransaction(args, 'ListClaims', function (filter: any): Promise<any[]> {
      return new Promise(function (resolve: Function, reject: Function) {
        Claim.aggregate([
          {
            $match: filter
          },
          {
            $lookup: {
              "from": "evaluateclaims",
              "localField": "txHash",
              "foreignField": "claimId",
              "as": "evaluations"
            }
          },
          { $sort: { "evaluations.version": -1 } }
        ],
          function (error: Error, result: any[]) {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
      });
    });
  }
}